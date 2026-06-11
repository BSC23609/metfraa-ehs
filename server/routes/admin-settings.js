// ============================================================================
// Admin Settings API
//
// CRUD endpoints for the projects list, plus public listing (used by form
// dropdowns).
//
//   GET    /api/projects                    list ACTIVE projects (any user)
//   GET    /api/admin/projects              list ALL projects (admin)
//   POST   /api/admin/projects              create new project (admin)
//   PATCH  /api/admin/projects/:id          update name/active/aliases (admin)
//   DELETE /api/admin/projects/:id          permanently delete (admin)
// ============================================================================

const express = require('express');
const projectsStore = require('../lib/projects-store');
const { requireAuth, requireAdmin } = require('../lib/auth-middleware');

const router = express.Router();

// -------------------------------------------------------------------------
// GET /api/projects — public listing (active projects only, for form dropdowns)
// -------------------------------------------------------------------------
router.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const active = await projectsStore.listActive();
    res.json(active.map(p => ({ id: p.id, name: p.name })));
  } catch (err) {
    console.error('[GET /api/projects]', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// Admin endpoints
// -------------------------------------------------------------------------
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

// List ALL projects (active + deactivated)
adminRouter.get('/projects', async (req, res) => {
  try {
    const all = await projectsStore.listProjects(true);
    res.json(all);
  } catch (err) {
    console.error('[GET /api/admin/projects]', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new project
adminRouter.post('/projects', async (req, res) => {
  try {
    const { name, aliases } = req.body || {};
    const project = await projectsStore.addProject({
      name,
      aliases: Array.isArray(aliases) ? aliases : [],
      createdBy: req.user.email,
    });
    // Invalidate charts cache since aliases may resolve differently now
    bustChartsCache();
    res.json(project);
  } catch (err) {
    console.error('[POST /api/admin/projects]', err);
    res.status(400).json({ error: err.message });
  }
});

// Update project (name, active, aliases)
adminRouter.patch('/projects/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.aliases !== undefined) updates.aliases = req.body.aliases;
    const updated = await projectsStore.updateProject(req.params.id, updates);
    bustChartsCache();
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/admin/projects/:id]', err);
    res.status(400).json({ error: err.message });
  }
});

// Permanently delete project
adminRouter.delete('/projects/:id', async (req, res) => {
  try {
    await projectsStore.deleteProject(req.params.id);
    bustChartsCache();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/admin/projects/:id]', err);
    res.status(400).json({ error: err.message });
  }
});

function bustChartsCache() {
  try {
    const chartsRouter = require('./admin-charts');
    if (chartsRouter.clearCache) chartsRouter.clearCache();
  } catch {}
}

router.use('/api/admin', adminRouter);

module.exports = router;
