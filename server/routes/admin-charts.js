// ============================================================================
// Admin Charts API
//
// GET /api/admin/charts?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
// Returns 5 chart datasets aggregated from the master logs:
//   1. toolbox       — count of TBT submissions grouped by project_name
//   2. induction     — count of inductions grouped by project_name
//   3. ehsAudit      — sum of unsafe_acts and unsafe_conditions per project
//   4. incident      — count of incidents grouped by project + accident_type
//   5. permitRecord  — count of permits grouped by site_name
//
// All counts only include APPROVED submissions (rejected and pending are
// excluded — they don't represent real activity).
//
// Empty status (legacy rows from before the approval workflow) is treated as
// Approved, matching the rest of the app's behaviour.
// ============================================================================

const express = require('express');
const ExcelJS = require('exceljs');
const onedrive = require('../lib/onedrive');
const projectsStore = require('../lib/projects-store');
const { FORMS_BY_ID } = require('../lib/forms-config');
const { requireAdmin } = require('../lib/auth-middleware');

const router = express.Router();
router.use(requireAdmin);

// In-memory cache: { [formId]: { rows: [...], expiresAt: <ms> } }
const CACHE = {};
const CACHE_TTL_MS = 60 * 1000;

// Forms we read for charts. Order matters only for the API response shape.
const CHART_FORMS = ['toolbox', 'induction', 'ehs-audit', 'incident', 'permit-record'];

// ---------------------------------------------------------------------------
// Read one form's master log and return parsed rows (with relevant columns)
// ---------------------------------------------------------------------------

async function loadFormRows(formId) {
  const form = FORMS_BY_ID[formId];
  if (!form) return [];

  const cached = CACHE[formId];
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const logPath = `${form.folder}/_MasterLog.xlsx`;
  let buffer;
  try {
    buffer = await onedrive.downloadFile(logPath);
  } catch (err) {
    if (err.statusCode === 404 || /404/.test(err.message)) {
      CACHE[formId] = { rows: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
    }
    console.error(`[admin-charts] failed to read ${logPath}:`, err.message);
    return [];
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Submissions') || wb.worksheets[0];
  if (!ws) return [];

  // Read all header names so we can look up columns by their label text.
  // (This decouples from column positions — the master log structure can vary
  // between forms, especially with the approval-workflow columns added later.)
  const headerRow = ws.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });
  const idxOf = (name) => headers.findIndex(h => h === name);

  const colSubmittedAt = idxOf('Submitted At');
  const colStatus = idxOf('Status');

  // Form-specific column names we care about (must match the labels in
  // forms-config.js exactly — that's what excel-log.js writes to the file).
  const colProject = idxOf('Project Name');
  const colSite = idxOf('Site Name');
  const colUnsafeActs = idxOf('No. of Unsafe Acts');
  const colUnsafeConditions = idxOf('No. of Unsafe Conditions');
  const colAccidentType = idxOf('Accident Type');

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;

    const cellVal = (idx) => {
      if (idx <= 0) return '';
      const c = row.getCell(idx);
      const v = c.value;
      if (v && typeof v === 'object') {
        if ('text' in v) return String(v.text);
        if ('richText' in v) return v.richText.map(r => r.text).join('');
        if ('result' in v) return String(v.result);
      }
      return v === undefined || v === null ? '' : String(v);
    };

    const submittedAt = cellVal(colSubmittedAt);
    if (!submittedAt) return;

    rows.push({
      submittedAt,
      status: (cellVal(colStatus) || 'Approved').toLowerCase(),
      project: cellVal(colProject).trim(),
      site: cellVal(colSite).trim(),
      unsafeActs: parseNum(cellVal(colUnsafeActs)),
      unsafeConditions: parseNum(cellVal(colUnsafeConditions)),
      accidentType: cellVal(colAccidentType).trim(),
    });
  });

  CACHE[formId] = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// GET /api/admin/charts
// ---------------------------------------------------------------------------

router.get('/charts', async (req, res) => {
  try {
    let { startDate, endDate, project: projectFilter } = req.query;

    // Default: last 30 days
    if (!endDate) endDate = formatYmd(new Date());
    if (!startDate) {
      const start = new Date(`${endDate}T00:00:00`);
      start.setDate(start.getDate() - 29);
      startDate = formatYmd(start);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD' });
    }

    // Load all 5 master logs + the projects list in parallel
    const [toolboxRows, inductionRows, ehsAuditRows, incidentRows, permitRows, allProjects] =
      await Promise.all([
        ...CHART_FORMS.map(loadFormRows),
        projectsStore.listProjects().catch(() => []),
      ]);

    // Build an O(1) lookup table: lowercased raw value → canonical project name
    // This includes both exact names AND aliases.
    const aliasMap = new Map();
    for (const p of allProjects) {
      aliasMap.set(p.name.toLowerCase(), p.name);
      for (const alias of (p.aliases || [])) {
        const k = String(alias).trim().toLowerCase();
        if (k) aliasMap.set(k, p.name);
      }
    }
    const resolveName = (raw) => {
      if (!raw) return '(unspecified)';
      const lower = String(raw).trim().toLowerCase();
      return aliasMap.get(lower) || raw.trim() || '(unspecified)';
    };

    // Filter helper — date range + status (approved only) + optional project filter
    const inRangeApproved = (r, projectField) => {
      const d = String(r.submittedAt || '').slice(0, 10);
      if (d < startDate || d > endDate) return false;
      const s = (r.status || '').toLowerCase();
      if (s !== 'approved' && s !== '') return false;
      // Optional project filter applied AFTER alias resolution
      if (projectFilter) {
        const resolved = resolveName(projectField);
        if (resolved !== projectFilter) return false;
      }
      return true;
    };

    // ---- 1. Toolbox Talks by project ----
    const toolboxByProject = groupCount(
      toolboxRows.filter(r => inRangeApproved(r, r.project)),
      r => resolveName(r.project),
    );

    // ---- 2. Induction by project ----
    const inductionByProject = groupCount(
      inductionRows.filter(r => inRangeApproved(r, r.project)),
      r => resolveName(r.project),
    );

    // ---- 3. EHS Audit — sum of unsafe acts + conditions per project ----
    // EHS Audit uses 'Site Name' as its field key per forms-config, so check both.
    const ehsByProject = {};
    for (const r of ehsAuditRows) {
      const projectField = r.site || r.project;
      if (!inRangeApproved(r, projectField)) continue;
      const key = resolveName(projectField);
      if (!ehsByProject[key]) ehsByProject[key] = { unsafeActs: 0, unsafeConditions: 0 };
      ehsByProject[key].unsafeActs += r.unsafeActs;
      ehsByProject[key].unsafeConditions += r.unsafeConditions;
    }
    const ehsAudit = Object.entries(ehsByProject)
      .map(([project, v]) => ({ project, unsafeActs: v.unsafeActs, unsafeConditions: v.unsafeConditions }))
      .sort((a, b) => (b.unsafeActs + b.unsafeConditions) - (a.unsafeActs + a.unsafeConditions));

    // ---- 4. Incidents by project/site + accident type ----
    // Incident form uses 'Site Name' field key.
    const incidentByProject = {};
    for (const r of incidentRows) {
      const projectField = r.site || r.project;
      if (!inRangeApproved(r, projectField)) continue;
      const key = resolveName(projectField);
      if (!incidentByProject[key]) {
        incidentByProject[key] = { Major: 0, Minor: 0, 'Near Miss': 0, Unspecified: 0 };
      }
      const t = r.accidentType;
      if (t === 'Major' || t === 'Minor' || t === 'Near Miss') {
        incidentByProject[key][t] += 1;
      } else {
        incidentByProject[key].Unspecified += 1;
      }
    }
    const incident = Object.entries(incidentByProject)
      .map(([project, counts]) => ({
        project,
        major: counts.Major,
        minor: counts.Minor,
        nearMiss: counts['Near Miss'],
        unspecified: counts.Unspecified,
        total: counts.Major + counts.Minor + counts['Near Miss'] + counts.Unspecified,
      }))
      .sort((a, b) => b.total - a.total);

    // ---- 5. Permit Records by site/project ----
    // Permit Record form uses 'Project Name' field key per forms-config.
    const permitBySite = groupCount(
      permitRows.filter(r => inRangeApproved(r, r.project || r.site)),
      r => resolveName(r.project || r.site),
    );

    res.json({
      range: { startDate, endDate },
      projectFilter: projectFilter || null,
      availableProjects: allProjects.map(p => ({ id: p.id, name: p.name, active: p.active })),
      toolbox: toolboxByProject,
      induction: inductionByProject,
      ehsAudit,
      incident,
      permitRecord: permitBySite,
    });
  } catch (err) {
    console.error('[GET /api/admin/charts]', err);
    res.status(500).json({ error: err.message || 'Failed to load charts' });
  }
});

// Cache-busting endpoint
router.post('/charts/cache-clear', (req, res) => {
  for (const k of Object.keys(CACHE)) delete CACHE[k];
  res.json({ ok: true });
});

function clearCache() {
  for (const k of Object.keys(CACHE)) delete CACHE[k];
}
router.clearCache = clearCache;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Group rows by some key, return array of { label, count } sorted by count desc
function groupCount(rows, keyFn) {
  const buckets = {};
  for (const r of rows) {
    const k = keyFn(r);
    buckets[k] = (buckets[k] || 0) + 1;
  }
  return Object.entries(buckets)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function formatYmd(date) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + istOffsetMs);
  return ist.toISOString().slice(0, 10);
}

module.exports = router;
