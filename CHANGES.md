# Three fixes — June 2026

## 1. Project dropdowns on forms (debugging + defensive fix)

ISSUE: After the previous deploy, the "Project Name" field in forms was
still rendering as free text instead of a dropdown.

CAUSE: Most likely one of:
  - server/lib/forms-config.js didn't deploy (so the API still emits type='text')
  - Browser cached the old form.js (so even if API sends type='project', the
    new case in the switch wasn't there to handle it)
  - /api/projects returned empty (so the dropdown fell back to text input)

FIX: form.js now does TWO things:
  a. If a field comes through with type='text' but its key is 'project_name'
     or 'site_name', it forces the project-dropdown rendering anyway.
     This guarantees the dropdown shows even if forms-config.js didn't deploy.
  b. Logs to browser console exactly what was loaded.

HOW TO VERIFY AFTER DEPLOY:
  - Open any form
  - Open browser DevTools (F12) -> Console tab
  - Look for: "[form.js] loaded form: <id> - projects available: <count>"
  - If count is 0, you'll also see: "NO PROJECTS returned from /api/projects"
  - If you see "field project_name arrived as text — forcing project dropdown"
    that means forms-config.js didn't deploy and form.js is patching around it
    (the dropdown still works, but you should investigate why forms-config
    didn't reach the server)

## 2. Hide "test" projects from charts

Anything with "test" in the name (case-insensitive) is now ALWAYS filtered
out of the charts page. This applies to:
  - Chart bars (resolved names AND raw free-text names)
  - The "Project" filter dropdown above the charts
  - The Summary tile counts

NOTES:
  - Substring match: "TEST5", "test1", "TestProject" all get hidden
  - Aliased values are checked AFTER resolution, so if you've aliased "TEST5"
    to "AMNS Site - Oragadam", "AMNS Site - Oragadam" still shows (not hidden)
  - Test projects still appear in /admin-settings (so you can rename/delete)
  - Test projects still show in /submissions page (master log truth)
  - Existing aliases for legacy "test" names still resolve normally; they
    only get hidden if the RESOLVED name contains "test"

## 3. Grid view selector with pagination

NEW: 4 view-mode buttons above the charts: 1×1, 2×1, 2×2, 3×2.

Each button = page size:
  1×1 — 1 chart per page (6 pages total)
  2×1 — 2 charts per page (3 pages)
  2×2 — 4 charts per page (2 pages)
  3×2 — all 6 charts on one page (1 page, no arrows)

Left/right arrows appear when more than one page exists.
Page status shown in the middle ("Page 2 of 3").
Selection persists in browser localStorage (sticks per user).

Chart fonts and tile sizes auto-scale per mode:
  1×1 — large fonts, 420px chart height, summary in 3 columns
  2×1 — medium fonts, 340px chart height
  2×2 — smaller fonts, 260px chart height
  3×2 — current compact layout

## Files in this update (5 total)

### MODIFIED files (5)
- server/routes/admin-charts.js   - hides "test" projects from data
- public/admin-charts.html        - adds view-mode toolbar UI
- public/css/admin-charts.css     - per-mode grid layouts + toolbar styles
- public/js/admin-charts.js       - view mode state, pagination, renderPage()
- public/js/form.js               - defensive project dropdown fallback + debug logging

No new files in this drop, just patches to existing.

## How to apply

1. Drop these 5 files into your repo (matching folder structure)
2. Commit and push
3. Render auto-deploys
4. **HARD-REFRESH your browser** (Ctrl+Shift+R or Cmd+Shift+R) to bust
   any cached form.js or admin-charts.js from before — this is important
   because browser caching is one likely cause of the dropdown bug
5. Verify all 3 fixes in the order above

## Troubleshooting if dropdowns still don't appear

Open a form, then DevTools (F12 -> Console):
  - Look for "[form.js] loaded form: ..." log
  - If "projects available: 0":
      Open /api/projects in a new tab while signed in
      If it returns []: no projects in OneDrive _config/projects.json yet
        Go to /admin-settings -> add a project manually to seed it
      If it returns the projects but form still shows text input:
        Hard-refresh again (browser is still cached)
  - If you don't see the log at all:
      form.js didn't deploy. Confirm public/js/form.js timestamp on Render
