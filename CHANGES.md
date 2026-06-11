# Projects Management + 3x2 Grid Charts

Adds a projects database (dropdown for forms, settings page for admins)
and reorganizes the charts into a 3x2 tile grid with a project filter.

## What you get

### 1. Project dropdown on every form
All 21 forms used to have a free-text "Project Name" / "Site Name" field.
Now it's a dropdown populated from the projects list. Same shared list for
both "Project" and "Site" fields.

Default seed projects (created automatically on first run):
- AMNS Site - Oragadam
- KGISL Auditorium
- Patanjali
- Apollo

### 2. Settings page at /admin-settings (admin-only)
Full CRUD for projects:
- Add new project (with optional aliases)
- Rename project
- Deactivate / Reactivate (deactivated projects hide from form dropdowns
  but still appear on charts for historical context)
- Manage aliases (legacy free-text names that should map to this project)
- Delete project permanently

### 3. Alias support for old free-text entries
Existing master log rows have free-text values like "TEST5",
"AMNS site - Oragadam", "test", etc. By adding these as aliases to a
project, they automatically roll up to the canonical name on charts.

Example workflow:
1. Open /admin-settings
2. Click "Edit" on "AMNS Site - Oragadam"
3. In the Aliases field, add (one per line):
     TEST5
     AMNS
     amns oragadam
4. Save
5. Charts now show all those old entries under "AMNS Site - Oragadam"

Unmatched free-text entries appear under their raw name on the chart
(e.g. random old "TEST" entries that aren't aliased to anything). You
can either alias them or ignore them.

### 4. 3x2 grid charts layout
The 5 charts now display in a 3x2 tile grid (was vertical scroll):

  Row 1: Toolbox Talks  |  Inductions  |  EHS Audit
  Row 2: Incidents      |  Permits     |  Summary

The Summary tile in slot 6 shows period totals at-a-glance across all
forms (TBTs, Inductions, Unsafe Acts, Unsafe Conditions, Incidents,
Permits) plus a count of active projects.

All 6 tiles fit on one screen for a single screenshot.

### 5. Project filter on charts page
New dropdown above the charts: "Project ▼ [All projects | AMNS… | …]".
Selecting a project filters all 5 charts to show only that project's
data — including alias-resolved historical entries.

## Where projects live (technical)

Stored as JSON at:
  Metfraa-EHS/_config/projects.json   (in OneDrive)

Created automatically with the 4 seed projects on first read if missing.
Cached server-side for 30 seconds. Cache busts on any CRUD operation
and when approvals happen.

## Files in this update

### NEW files (5)
- server/lib/projects-store.js        - read/write projects.json + alias lookup
- server/routes/admin-settings.js     - CRUD API
- public/admin-settings.html          - settings page
- public/css/admin-settings.css       - settings styles
- public/js/admin-settings.js         - settings client logic

### MODIFIED files (10)
- server/index.js                     - wires up settings routes + page
- server/lib/forms-config.js          - changes 21 fields from 'text' to 'project'
- server/routes/admin-charts.js       - alias resolution + project filter param
- public/admin-charts.html            - project filter dropdown in filter bar
- public/css/admin-charts.css         - 3x2 grid layout + summary tile styles
- public/js/admin-charts.js           - grid rendering + summary tile + filter wiring
- public/dashboard.html               - adds Settings link (admin only)
- public/admin-dashboard.html         - adds Settings link in header nav
- public/js/dashboard.js              - shows Settings link for admins
- public/js/form.js                   - renders dropdown for project-type fields

## How to apply

1. Drop these 15 files into your repo (matching folder structure)
2. Commit and push to GitHub
3. Render auto-deploys
4. Sign in as admin → "Settings" → see the 4 seed projects already there
5. Click "Charts" → see the new 3x2 layout

## Test checklist after deploy

1. /admin-settings shows 4 active projects (auto-seeded)
2. Click "Edit" on a project, add an alias, Save → no errors
3. Click "Deactivate" → project moves to "Deactivated" section
4. Click "Reactivate" → back to active
5. Open any form (e.g. Toolbox Talks) → "Project Name" is now a dropdown
6. Submit a form using one of the dropdown values → approves normally
7. /admin-charts now shows 3x2 tile layout with 6th slot = Summary
8. Click "Project" dropdown filter → select a project → all charts
   filter to that project only
9. Manage aliases for a project, set them to match old free-text values,
   refresh charts → old entries now grouped under canonical project name

## Migration tips for existing data

Your existing forms had free-text project names. To clean up the charts:

1. Visit /admin-charts (default = This Month) — see what raw names appear
2. For each raw name that should map to one of your real projects:
   a. Open /admin-settings
   b. Click Edit on the target project
   c. Add the raw name as an alias
   d. Save
3. Charts auto-update — that raw name now rolls up to the canonical name
4. Any leftover raw names that are genuine test data — either leave them
   (they'll show as their own bars), or create a "Test / Other" project
   and alias them under it

## Behavior notes

- Forms now FORCE selecting from the dropdown — users can't type a custom
  project name. If their site isn't listed, an admin must add it first.
  For admins, the form shows a "Manage projects →" link below the dropdown
  for quick access.
- Deactivated projects still appear in the chart project filter dropdown
  (in a separate "Deactivated" optgroup) so admins can review their history.
- Deleting a project removes it from the dropdown but does NOT delete any
  master log rows. The historical data lives in OneDrive master logs forever.
- Aliases are case-insensitive ("test5" matches "TEST5" matches "Test5").
- An empty projects.json (e.g. you delete all 4 seeds) makes form dropdowns
  fall back to free-text inputs as a safety net.

## What didn't change

- The approval workflow (forms still go to pending → approver reviews → approved)
- The Incident form's Accident Type field (still required radio)
- Master log column layouts
- Existing Approved submissions and their PDFs
- Authentication and login flow
