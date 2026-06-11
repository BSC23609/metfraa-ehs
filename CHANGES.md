# Project Charts feature + Accident Type field on Incident form

A new admin-only page at /admin-charts that shows 5 bar charts aggregating
data from the master logs.

## What this delivers

### 1. NEW: Accident Type field on Incident form
Added a required radio field with options Major / Minor / Near Miss to the
Incident / Accident Report form. Sits between the existing "Incident Type"
and "Injury Details" fields.

### 2. NEW: Project Charts page at /admin-charts
Admin-only page with 5 bar charts:

1. **Toolbox Talks** - count of TBTs per project_name
2. **Inductions** - count of inductions per project_name
3. **EHS Audit** - grouped bars: sum of unsafe acts + sum of unsafe conditions per project
4. **Incidents / Accidents** - stacked bars by accident type (Major/Minor/Near Miss + Unspecified for old rows) per project/site
5. **Permit Records** - count per site_name

### 3. Date filter with presets
- Today
- Yesterday
- This Week (Monday through today)
- This Month (1st through today)
- This Year (Jan 1 through today)
- Custom date range

### 4. Only approved submissions counted
Rejected and pending submissions are excluded from the counts. Empty status
(legacy rows from before the approval workflow) is treated as approved.

### 5. Navigation links added
- /admin-dashboard (existing) now has a "Charts" link in its header
- /admin-charts (new) has a "Dashboard" link to go back
- Main dashboard now shows a "Charts" button for admins next to "Admin"

## Files in this update

### NEW files (4)
- server/routes/admin-charts.js     - aggregation API
- public/admin-charts.html          - page shell
- public/css/admin-charts.css       - styles
- public/js/admin-charts.js         - chart rendering

### MODIFIED files (6)
- server/index.js                   - wires up new route + page
- server/lib/forms-config.js        - adds Accident Type field to Incident form
- server/routes/approvals.js        - invalidates charts cache on approve/reject
- public/dashboard.html             - adds Charts button (admin only)
- public/admin-dashboard.html       - adds Charts link in header
- public/js/dashboard.js            - shows Charts button for admins

## IMPORTANT: One-time manual fix for Incident master log

The Incident form now has a new "Accident Type" field positioned BETWEEN
"Incident Type" and "Injury Details". Existing _MasterLog.xlsx for incidents
has its columns laid out without this new column.

After deploying this code, you MUST manually add the "Accident Type" column
header in the existing Incident master log file. If you skip this step,
NEW incident approvals will write data into the wrong columns.

### How to fix the Incident master log (one-time, before/just after deploy)

1. Open `04-Incident-Reports/_MasterLog.xlsx` in OneDrive (Excel Online or download)
2. Find the "Incident Type" column header (currently around column L or M)
3. Insert a NEW column immediately to the RIGHT of "Incident Type":
   - Right-click the column letter for "Injury Details" -> Insert
4. Type "Accident Type" as the new column header (row 1)
5. Apply the same formatting as the other headers (blue background, white bold text)
6. Save and close

Old incident rows will have a blank "Accident Type" cell -- they'll show up
on the chart under "Unspecified" until you manually fill them in (optional).
NEW incident submissions will require selecting Major/Minor/Near Miss and
will populate this column automatically.

If you don't have any pending incident approvals or existing logs, you can
skip this step -- the master log will be recreated when the first approval
happens.

## How to apply

1. Drop these 10 files into your repo (matching the folder structure)
2. Manually fix the Incident master log header (see above)
3. Commit and push to GitHub
4. Render auto-deploys
5. Sign in as an admin, click "Charts" in the header

## Testing checklist after deploy

1. Open /admin-charts as admin -> 5 chart sections render (some may be empty)
2. Click each date preset (Today, Yesterday, This Week, This Month, This Year)
3. Type a custom date range and click Apply
4. Submit a new Incident form -> verify "Accident Type" radio is required
5. Approve the incident -> check it appears in the Incidents chart
6. Open the Incident _MasterLog.xlsx -> verify the new accident_type value
   landed in the right column (the manually-added "Accident Type" column)

## Notes

- 60-second cache on the charts API for performance
- Cache auto-invalidates when approvals/rejections happen
- Empty date ranges render a clean "No data" empty state per chart
- Project/site names with extra whitespace are trimmed but not normalized
  for case -- "AMNS site" and "amns site" will be separate bars
