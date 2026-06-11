// ============================================================================
// Projects Store
//
// Manages the master list of projects stored at:
//   Metfraa-EHS/_config/projects.json
//
// Each project has:
//   - id          stable internal ID (e.g. "proj_001"), used for refs
//   - name        display name shown in dropdowns
//   - active      whether to show in form dropdowns
//   - aliases     legacy names from free-text submissions that map here
//   - createdAt   IST timestamp
//   - createdBy   email of admin who created it
//
// Used by:
//   - forms-config / form.js     dropdown options for "project" and "site" fields
//   - admin-settings              CRUD API
//   - admin-charts                resolves free-text master log values to canonical project names
//
// Cached in memory for 30 seconds to avoid hammering OneDrive.
// ============================================================================

const onedrive = require('./onedrive');
const { nowIstString } = require('./datetime');

const CONFIG_PATH = '_config/projects.json';
const CACHE_TTL_MS = 30 * 1000;
let CACHE = null;
let CACHE_EXPIRES_AT = 0;

// Default seed when no projects.json exists yet
const DEFAULT_PROJECTS = [
  { id: 'proj_001', name: 'AMNS Site - Oragadam', active: true,  aliases: [], createdAt: '2026-06-11 00:00:00', createdBy: 'system' },
  { id: 'proj_002', name: 'KGISL Auditorium',     active: true,  aliases: [], createdAt: '2026-06-11 00:00:00', createdBy: 'system' },
  { id: 'proj_003', name: 'Patanjali',            active: true,  aliases: [], createdAt: '2026-06-11 00:00:00', createdBy: 'system' },
  { id: 'proj_004', name: 'Apollo',               active: true,  aliases: [], createdAt: '2026-06-11 00:00:00', createdBy: 'system' },
];

// -------------------------------------------------------------------------
// Read all projects (with cache)
// -------------------------------------------------------------------------

async function listProjects(forceFresh = false) {
  if (!forceFresh && CACHE && Date.now() < CACHE_EXPIRES_AT) {
    return CACHE;
  }

  let projects;
  try {
    const buffer = await onedrive.downloadFile(CONFIG_PATH);
    const json = JSON.parse(buffer.toString('utf-8'));
    projects = Array.isArray(json.projects) ? json.projects : [];
  } catch (err) {
    // First-time: file doesn't exist yet — seed with defaults
    if (err.statusCode === 404 || /404/.test(err.message)) {
      projects = DEFAULT_PROJECTS;
      try {
        await save(projects);
      } catch (saveErr) {
        console.warn('[projects-store] seed save failed:', saveErr.message);
      }
    } else {
      console.error('[projects-store] read failed:', err.message);
      projects = DEFAULT_PROJECTS;  // graceful fallback so the app still functions
    }
  }

  // Normalize: ensure every project has all required fields
  projects = projects.map(p => ({
    id: p.id || generateId(),
    name: String(p.name || '').trim(),
    active: p.active !== false,
    aliases: Array.isArray(p.aliases) ? p.aliases : [],
    createdAt: p.createdAt || nowIstString(),
    createdBy: p.createdBy || 'unknown',
  })).filter(p => p.name); // drop empty-name entries

  CACHE = projects;
  CACHE_EXPIRES_AT = Date.now() + CACHE_TTL_MS;
  return projects;
}

// Get only active projects (used by form dropdowns)
async function listActive() {
  const all = await listProjects();
  return all.filter(p => p.active);
}

// Find canonical project name for a free-text value.
// Returns the matched project's name, or null if no match.
// Used by admin-charts to bucket legacy free-text entries under canonical names.
async function resolveAlias(rawValue) {
  if (!rawValue) return null;
  const lower = String(rawValue).trim().toLowerCase();
  if (!lower) return null;

  const all = await listProjects();

  // Exact name match (case-insensitive)
  const exact = all.find(p => p.name.toLowerCase() === lower);
  if (exact) return exact.name;

  // Alias match
  const aliased = all.find(p =>
    (p.aliases || []).some(a => String(a).trim().toLowerCase() === lower)
  );
  return aliased ? aliased.name : null;
}

// -------------------------------------------------------------------------
// Write all projects back to OneDrive
// -------------------------------------------------------------------------

async function save(projects) {
  const content = JSON.stringify({ projects }, null, 2);
  const buffer = Buffer.from(content, 'utf-8');
  await onedrive.uploadFile(CONFIG_PATH, buffer, 'application/json');
  // Invalidate cache so next read pulls fresh
  CACHE = projects;
  CACHE_EXPIRES_AT = Date.now() + CACHE_TTL_MS;
}

// -------------------------------------------------------------------------
// CRUD operations (called by admin-settings route)
// -------------------------------------------------------------------------

async function addProject({ name, aliases = [], createdBy = 'unknown' }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Project name is required');

  const all = await listProjects(true);
  if (all.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error(`Project "${trimmedName}" already exists`);
  }

  const newProject = {
    id: generateId(),
    name: trimmedName,
    active: true,
    aliases: aliases.map(a => String(a).trim()).filter(Boolean),
    createdAt: nowIstString(),
    createdBy,
  };
  all.push(newProject);
  await save(all);
  return newProject;
}

async function updateProject(id, updates) {
  const all = await listProjects(true);
  const idx = all.findIndex(p => p.id === id);
  if (idx < 0) throw new Error('Project not found');

  const current = all[idx];

  if (updates.name !== undefined) {
    const trimmedName = String(updates.name).trim();
    if (!trimmedName) throw new Error('Project name cannot be empty');
    // Reject duplicate name (other than self)
    if (all.some((p, i) => i !== idx && p.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error(`Project "${trimmedName}" already exists`);
    }
    current.name = trimmedName;
  }
  if (updates.active !== undefined) {
    current.active = !!updates.active;
  }
  if (updates.aliases !== undefined) {
    if (!Array.isArray(updates.aliases)) throw new Error('Aliases must be an array');
    current.aliases = updates.aliases.map(a => String(a).trim()).filter(Boolean);
  }

  await save(all);
  return current;
}

async function deleteProject(id) {
  const all = await listProjects(true);
  const filtered = all.filter(p => p.id !== id);
  if (filtered.length === all.length) throw new Error('Project not found');
  await save(filtered);
}

// Invalidate cache (called when admin-settings makes changes)
function clearCache() {
  CACHE = null;
  CACHE_EXPIRES_AT = 0;
}

function generateId() {
  return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = {
  listProjects,
  listActive,
  resolveAlias,
  addProject,
  updateProject,
  deleteProject,
  clearCache,
};
