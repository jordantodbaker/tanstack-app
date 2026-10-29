# EPC Manager — User Guide

> **The shipped guide lives in the app**, not here. `src/config/help-guide.ts`
> is the authoritative copy: it is what the header's **?** button and the
> `/help` route render, and it is filtered to each reader's role. Edit that
> file when app behavior changes.
>
> This document is kept as the plain-text reference for anyone reading the
> repo rather than using the app. It has no role filtering, so it describes
> every feature including the administrator-only ones — expect it to lag the
> in-app guide.

A field-estimating and change-management app for EPC projects. It has two halves
that stay reconciled with each other:

1. **The Field Estimate Form** — build a bottom-up cost estimate per discipline
   (take-off quantities → labor + materials → totals), captured as an **as-bid
   snapshot**.
2. **The Change Log and related registers** — track everything that moves the
   number after award: CVRs, field change orders, RFIs, trends, and owner PCOs.

The **Summary** page ties them together into a _living budget_: as-bid estimate
→ approved changes → current budget → forecast.

---

## 1. Getting started

- **Sign in** with your account (Clerk). Access to a project is granted per user.
- **Pick a project** from the selector in the header (or the sidebar on smaller
  screens). Almost everything in the app is scoped to the selected project — the
  estimate, the logs, the budget. Switching projects re-scopes the whole UI.
- **Roles.** _Administrators_ additionally see the **Admin** section and the
  **Field Estimate Form / Setup**. Workflow actions (approving a CVR, etc.) are
  gated by role.

### Finding things fast

- **Global search:** press **⌘K / Ctrl-K** anywhere (or **/** when you're not
  typing in a field). Searches across CVRs, FCOs, RFIs, PCOs, and Trends in the
  current project; arrow keys to move, **Enter** to open.
- **Recently viewed:** the Change Log's sidebar keeps a per-project list of
  records you opened recently — one click jumps back to them.

### Navigation

The platform is split into **apps**, each with its own navigation:

| App                           | What it's for                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------- |
| **Field Estimate Form**       | Build the estimate — take-offs by discipline, then Summary, Basis and Validation |
| **Change Log**                | Trends, PCOs, RFIs and field change orders                                       |
| **Cost Breakdown Structure**  | The cost code library — which codes a project may use, its list, and the catalog |
| **Reporting**                 | Dashboard, cost periods, earned value and CVRs                                   |
| **Administration** _(admins)_ | Projects, rates, templates, users, system                                        |

- **Launcher:** the home page shows one card per app with a live figure for the
  selected project — take-off rows needing attention, items awaiting approval,
  the latest reporting period. The logo returns you to it.
- **App switcher:** the button in the header naming the current app moves
  between them, and has **All apps** at the bottom for the launcher.
- **Top nav:** the current app's pages only. Anything that doesn't fit the
  window collapses into a **More** menu.
- **Sidebar:** the current app's navigation. In the Field Estimate Form that's
  Setup, the **Summary** group (Summary · Basis · Validation) and the
  **disciplines** (Civil, Concrete, Steel, Piping, Electrical, … plus
  Engineering, Procurement, Administration, etc.); a ⚠️ next to a discipline
  means its Take Off has rows that can't compute a cost yet. Every other app
  lists its own pages instead.
- **Version picker:** only in the Field Estimate Form — versions are an
  estimate concept and don't filter the other apps.
- **Recently viewed:** at the foot of the Change Log's sidebar, since the five
  record types it tracks all live there.

---

## 2. The Field Estimate Form

Open a discipline from the sidebar (e.g. **Piping**). Each discipline has two
tabs.

### Take Off

The main quantity/cost entry grid. Per row:

- **Name** — pick the **CBS item** from the picker; this stamps the row's **ID**
  (CBS code) and **Unit** automatically.
- **Area** — assign the row to a project area (optional; used for area roll-ups).
- **Role + Schedule** _or_ **Crew Mix** — toggle **Use Role / Use Crew Mix** in
  the toolbar. Role+Schedule resolves a **Labor Rate** from the rate table; a
  Crew Mix uses the crew's average wage.
- **Quantity × Labor Factor = Labor Hours** — the factor defaults to 1.0 (hours =
  quantity) until you override it. **Labor Hours × Labor Rate = Total Cost.**
- **Sub** — mark subcontracted scope (enabled only for CBS items flagged as sub).

Working with rows:

- **Adding rows is automatic:** as soon as the last row has a computable Total
  Cost, a fresh blank row appears beneath it — so there's always a row to type
  into.
- **Copy / paste rows:** select a range of cells (click a cell, then Shift+Click
  or Shift+Arrow), **Ctrl+C**, click a destination cell, and **Ctrl+V** — the
  same as Excel, including pasting to and from a spreadsheet. Use this to
  duplicate rows.
- **Row checkboxes** (left column) mark rows for **Create CVR from Selected**.
- **Show / Hide Details:** collapses the wide detail columns (ID, Unit, rates,
  etc.) for a cleaner take-off view.
- **Invalid rows** (started but Total Cost can't be computed) are tinted and
  counted with the ⚠️ badge in the sidebar and on the **Validation** page.
- **Keyboard navigation:** move between cells like a spreadsheet — **Enter** (or
  **↓**) commits the cell and moves down, **Shift+Enter** / **↑** move up, and
  **← / →** move the caret through the text, jumping to the next column once the
  caret reaches the edge. **Esc** reverts a cell to its last saved value.
- **Undo / redo:** the toolbar's **↶ / ↷** buttons — or **Ctrl+Z** and
  **Ctrl+Shift+Z** (**Ctrl+Y** also redoes) — step back and forward through row
  edits. Each paste, fill, or clear counts as a single step.

### Spreadsheet-style range editing (Take Off)

The Take Off grid handles bulk edits like Excel:

- **Select a range** — click a cell, then **Shift+Click** another cell, or hold
  **Shift** and press the **arrow keys**, to extend a highlighted rectangle.
- **Copy — Ctrl+C** — copies the selected cells to the clipboard as
  tab-separated text, so you can paste them straight into Excel or Google
  Sheets. Every column copies, including computed ones (ID, Labor Hours, Total
  Cost) and the Crew Mix name.
- **Paste — Ctrl+V** — pastes a block starting at the top-left of your
  selection, spilling right and down. It works from Excel, Google Sheets, or the
  grid itself; if the pasted block is taller than the sheet, **new rows are added
  automatically**.
- **Fill down — Ctrl+D**, or **drag the fill handle** (the small square at the
  bottom-right corner of the selection) downward — copies the top row of the
  selection down through the rest.
- **Clear — Delete** — empties the writable cells in the selection.

**Which columns accept paste / fill / clear:** Description, Notes, Quantity,
Labor Factor, Area, Role, Schedule, **Name** (CBS item), and **Crew Mix**. Writes
keep the row consistent — changing Quantity or Labor Factor recomputes **Labor
Hours**, Role/Schedule re-resolve the **Labor Rate**, a Name resolves the CBS
**code + unit**, and a Crew Mix snapshots the crew's **average wage** onto the
rate (clearing Role/Schedule). A pasted value that doesn't match a known Area,
Role, Schedule, CBS item, or Crew Mix is **skipped** rather than written, so a
stray cell can't corrupt a row.

The computed columns — **ID, Unit, Labor Hours, Labor Rate, Total Cost** — and
the **Sub** checkbox are read-only to range edits: they still copy out, but
paste, fill, and clear skip them.

### Importing rows from a spreadsheet

For bringing in many rows at once, the **Paste from Excel** button opens an
importer. Paste your columns in this order — **CBS Code · Description · Quantity ·
Labor Factor · Labor Rate · Area · Role · Schedule · Notes** — and the importer
detects and skips a header row and cleans commas / `$` from numbers. Trailing
columns are optional, so a shorter block is fine as long as the order matches;
**Export CSV** emits exactly this set first, so an exported sheet round-trips.
Each **CBS Code** is matched against the catalog to fill Name and Unit. Any row
whose CBS code belongs to a
**different discipline** is routed to that discipline's Take Off automatically
(and saved there), with a note telling you how many rows were routed.

### Exporting

**Export CSV** downloads the current Take Off as a spreadsheet (with area labels
resolved), named by discipline and date. The toolbar also shows a **live tally**
of item count, labor hours, and labor cost for the sheet.

### Field Estimate (Craft Labor + Support Labor)

- **Craft Labor** is derived from your Take Off rows.
- **Support Labor** is entered directly — its **Name** column is a **searchable
  CBS picker** (fills ID, Name, Unit), with Role/Schedule driving the rate and
  Labor Hours entered by hand. It grows the same way Take Off does (a new blank
  row appears once the last one is complete).

### Materials

Per-discipline material lines: pick the CBS item, enter **Quantity × Material
Cost = Total Cost**.

### Working with the CBS tree

Three pages show the CBS as a color-coded, collapsible hierarchy: **Setup**,
the **Project Cost Code List**, and the administrators' **CBS Code Book**. They
differ in what they list and what you can do there, but the tree and its
toolbar are the same on all three, so they are described once here.

Every one of them lists **cost lines**: an account's own **-0** roll-up row
and, beneath it, one row per cost type the account carries — **L** labor,
**S** subcontract, **M** material, **E** equipment, **O** other, **R** rental —
each with its own code. The letter at the end of a row's code is its cost type,
and a small colored **chip** beside the code repeats it so the tree scans at a
glance; the roll-up row has no chip. Names keep the marker the workbook writes
("Executive (L)", "Piping (*)").

**Level colors.** The tree is colored by code level, the way the source
workbook colors it. The **L0–L5 swatches** under "Level colors" are buttons:
click one to open the whole tree to that level and no deeper — **L0** collapses
to the discipline roots, **L5** is the same as **Expand all**. The swatch in
force is outlined, and the outline clears once you open or close a row
yourself.

**The toolbar** has two rows. The first holds everything that decides which
rows exist: the **Discipline** picker, the **cost-type** buttons, the
**Material type** and **Cost classification** pickers, and — on the CBS
Dictionary only — **Status** and **Row type**. The second holds the search box,
**Expand all** / **Collapse all** and the page's own controls (the Excel
export, the match count). While anything is filtering, the second row also
names the filters in force, in the same words the Excel export prints in its
subtitle, and offers **Clear filters**, which resets the search and every
filter at once. The same button appears under the empty message when a filter
leaves nothing to show.

**Search** matches the code, the name, the account description and the unit.
Terms are order-free and all required, so "rental pipe" finds "Pipe Shop Third
Party Rental", and a code typed without its dashes ("60420") finds its row —
useful when pasting from the workbook's **Cost Code** column or from Excel. A
plain text search keeps the parents of a hit, because knowing where a hit sits
is most of the answer. The catalog views hold some 14,000 rows, so the tree
follows the box on a slight delay and shows a small "Filtering…" mask while it
catches up.

**Cost types** — **Labor**, **Subcontracts**, **Materials**, **Equipment**,
**Other** and **Rental** — narrow the tree to one kind of code. A row qualifies
on **its own cost type alone**, the last segment of its code: filter on
**Materials** and you get the codes ending in **M** — not the **S** row of an
account that happens to carry a material code, and not the **0** roll-up above
them. The buttons widen each other, so turning two on shows either kind, and
they narrow the search rather than widening it: "pumps" with **Subcontracts**
on means subcontract rows mentioning pumps.

Every filter other than a bare text search is **strict**: only rows that
qualify survive, and a parent that does not is dropped with its matching
children lifted into its place. A parent kept only to hold children would read
as a code that is not of that kind.

**Pickers.** Three multi-select pickers narrow the tree by a workbook column.
Each lists the values present on the page's rows with a count beside each, and
**(none)** stands for a blank cell; tick several to see rows of any of them,
and **Clear** inside the picker goes back to all. The counts are faceted: each
is how many rows ticking that value would show given the other filters in
force, so they move as you filter, and a value with nothing left shows **0**
rather than vanishing, so a tick can always be undone.

- **Discipline** — the workbook's Discipline column (Civil, Piping, Home Office
  & Administration, …). It sits first because the other filters are usually
  asked within one discipline.
- **Material type** — Tagged, Bulk, Consumable, … over the **Materials** lines
  only. It is greyed out until **Materials** is pressed, since it narrows those
  lines and nothing else; it leaves any other cost type you have on alone, and
  clears when Materials is turned off.
- **Cost classification** — DIRECT LABOR, INDIRECT, MATERIALS, ….

**Status** and **Row type** belong to the **CBS Dictionary** alone — the one
view that lists inactive and generated rows as a matter of course. **Status** —
**Active**, **Inactive**, **Retired** — narrows the same strict way. A blank
Status counts as **Active**: roughly 190 live accounts have never had the cell
filled in, section summaries among them, so treating blanks as retired would
hide their children's parents. **Row type** — **All**, **Original**,
**Generated** — reads the workbook's **Original Row** column: TRUE for an
account's own **-0** row, FALSE for a cost-type line generated from it.

**Selecting a row** opens its full detail in the panel on the right: unit, cost
code, account, cost classification, discipline, description, and the
**Original Row** and **Expanded Row** it occupies in the source workbook. The
panel's header says whether the row is **Original** or **Generated**.

**Linking to one code.** All of these pages accept a `?code=` link — for example
`/project-cost-codes?code=052-15-0500-00-L`. Opening it expands the tree down to
that account, selects it so the detail panel fills, and scrolls it into view.
Useful for pointing someone at a specific code in an email rather than
describing where to find it. An unknown code is ignored and the page opens
normally.

**Export Excel** downloads what you are looking at — the rows left by the search
box and the filters, and nothing else. The sheet opens with a labeled block
giving the **project number** and **project title**, what the rows cover, the
filter applied, the code count and the export date; the project number is in
the filename too, so forwarded files can be told apart. The file keeps the level
colors and turns the hierarchy into Excel's own row grouping, so the ± controls
in the margin collapse it the way the page does. Collapsing branches on screen
doesn't change the file — Excel's grouping is what collapses it there. Each page
exports by its own rules, so the file always matches the screen.

### Setup (admins)

Project configuration — which **CBS items** a project may use. This controls
which disciplines appear in the sidebar and which items the pickers offer.

Setup is the first link in the **Cost Breakdown Structure** app, above the
**Project Cost Code List** it feeds, and is offered to administrators only. It
applies to the **selected project**, so check the project in the header before
granting anything.

The tree is the full CBS, **active codes only** — a retired code cannot be
granted — with the same filters as the other pages apart from Status and Row
type. **Ticking a parent allows everything beneath it**; a half-filled box means
only some of its children are allowed. Clicking a row only opens its detail —
ticking its checkbox is what changes the allow-list. Rows whose code ends in
**S** or **M** are the subcontract and material lines of the account above
them — allow those too if the project will book cost against them. Filtering
changes what is shown, not what a tick does: a row picked out by a filter is
granted like any other.

> **Saving:** edits autosave as you go (debounced). No "Save" button to hunt
> for.

> **After a CBS update:** new codes are never granted automatically. Come back
> here and allow the new items each project needs, or its pickers won't offer
> them.

### Project Cost Code List

A read-only list of the cost codes available on the selected project — exactly
what an admin allowed in **Setup**. Nothing on this page changes the estimate or
the allow-list.

Every cost line the project has been granted is listed, each cost type on its
own row, generated subcontract and material rows included. Only **Active**
codes are listed — inactive and retired ones are in the CBS Dictionary
(**Cost Breakdown Structure → CBS Code Book**, administrators only).

Grayed-out, italic rows are **parent summaries the project wasn't granted**,
shown only so the codes beneath them sit in the right place in the hierarchy.
They aren't counted in the row count or the pickers' counts, and don't appear
in the Field Estimate Form's code pickers — they are not codes you can use. To
make one usable, tick it in **Setup**.

**Hide ungranted parents** drops those rows and lifts their granted children up
to the nearest parent the project does hold, leaving only codes that can
actually be used. The toggle appears only when there are some to hide, and
**Export Excel** follows it — with the toggle on, the file leaves them out too
and says so on its Scope line.

### CBS Code Book (administrators)

The whole catalog, no project allow-list applied, in two sections:

- **Cost Accounts** — every **active** cost line, each cost type on its own
  row. It is the list to pick codes from.
- **CBS Dictionary** — every row, each cost type on its own line, **Active**,
  **Inactive** and **Retired** alike, with the **Status** and **Row type**
  filters to narrow them. This is the one view that hides nothing, so a code you
  cannot find anywhere else is findable here.

Both sections filter the way every other CBS tree does; the Dictionary simply
adds Status and Row type. Each section's **Export Excel** follows its own
section's rule.

On an export from either section the project number is recorded for traceability
only: both lists ignore the allow-list, as the Scope line says.

### Core Code Roll-up (administrators)

A CBS code says **where** a cost sits; a Core code says **what kind** of cost
it is, by pointing at the account in 050 Field Indirects it belongs with. Civil's
field staff, Concrete's and Piping's all point at `052-00` "Field Staff", so the
same estimate totals two ways: by discipline, and by core account.

Each row of the grid is a core account and each column a discipline; the number
is how many of that discipline's codes point there. A **·** is a discipline not
yet core-coded for that account. Click a row to see the actual items, grouped by
discipline. Coverage bars at the foot show how far the coding has got per
discipline — it is a work in progress, so the gaps are the point.

An amber panel lists Core codes that resolve to nothing, which usually means the
account they named was removed by a workbook change.

### Code Usage

How much of a project's cost code list the estimate actually uses, by division:
granted against used, shaded by utilization, with the unused codes listed first
when you open a division — those are the ones worth revoking. Usage counts rows
in **every** estimate version, not just the current one, so a code dropped from
the latest version is not mistaken for dead.

> **Read the percentages as a floor.** The take-off pages build codes from an
> account plus the row's own attributes — metallurgy, bore size,
> fabricate/erect — so a piping row books to something like
> `604-MB-ST00-00-C`, which was never a dictionary row and cannot be matched to
> a granted code. The page says how many of those it found.

### CBS Health (administrators)

What is wrong with the catalog, if anything — the checks the import prints once
and then forgets, run against CBS.xlsx and the database as they stand. Checks
that pass are listed too, so "nothing reported" is distinguishable from "never
asked".

Each failing check lists every affected row with its **Original Row** in the
spreadsheet, sorted ascending, and exports to Excel as a worklist with
the same column. Errors cover things like two accounts sharing one display code
(the import keeps one and silently drops the other), a material row with no
material type, a roll-up row carrying a priced cost type, and Sub Code
contradicting an equipment row's ownership.

Four of the checks compare the spreadsheet against the database. Those only run
where CBS.xlsx actually is — on the deployed app they are listed as skipped,
and the rest still run.

---

## 3. Summary, Basis, Validation & Reporting

### Summary — the living budget

The **Current Budget & Forecast** panel is a waterfall, reconciled by CBS
account:

```
As-bid estimate  +  Approved CVRs  =  Current Budget   +  weighted Trends  =  AFC
                                       (Pending CVRs shown alongside, informational)
```

- **As-bid** comes from the chosen **baseline snapshot** (default: the latest;
  falls back to the live estimate if none exists).
- **+ Approved** = net of APPROVED/EXECUTED CVRs.
- **Pending** = open CVRs still in the approval pipeline, shown as a separate
  band (not yet in the budget).
- **+ Trend (weighted)** = probability-weighted trend forecast → **AFC**
  (Anticipated Final Cost).
- **Expand a discipline** to see its CBS **L1 accounts** (shown as `code — name`).
- **Baseline** selector switches which snapshot the budget is measured against;
  a note flags how the current working estimate differs from as-bid.
- **Export CSV** for the estimate detail.

### Basis

Captures the project's **basis-of-estimate** inputs (assumptions and parameters
behind the estimate).

### Validation

Lists Take Off rows across disciplines that can't compute a cost (missing labor
hours/rate) — the same rows the sidebar ⚠️ counts. Use it to clean up before
snapshotting.

### Reporting

**Earned-value (EVM)** reporting — periods with CPI/SPI and an S-curve, bucketed
by discipline.

### Snapshots

A snapshot freezes the estimate as an **as-bid baseline**. The Summary budget is
measured against a snapshot, and taking new snapshots lets you compare where the
estimate stands over time.

---

## 4. Change management (CVR / FCO / RFI / Trend / PCO)

All five registers share the same shell, so once you know one you know them all.

### Common to every log

- **List + filters:** free-text search plus Status and (where applicable)
  Discipline filters. Stat cards summarize counts/costs at the top.
- **Create / edit** via a dialog. **Numbers auto-assign** per project
  (`CVR-001`, `FCO-001`, `RFI-001`, `PCO-001`, `TR-001`) — leave the number
  blank to get the next one, or type your own.
- **Status workflow:** records advance through a defined set of statuses; the
  available actions depend on your role and whether you originated the record.
- **Bulk actions:** tick rows to apply a status transition to many at once, or
  delete (admin). The floating action bar shows what's applicable to the
  selection.
- **Export CSV** of the current (filtered) list.
- **Print / PDF** view for individual CVRs, FCOs, and RFIs.

### Change Log (CVRs)

The core change register. A CVR carries cost/schedule/labor-hours impact, risk,
originator/approver, affected CBS codes, and an optional **Cost Buildup** —
line items (`quantity × unit rate`, typed by cost category) whose subtotal
becomes the CVR's Cost Impact. **Templates** pre-fill common changes; attachments
and comments live on the dialog's side tabs. Approved CVRs move the **Current
Budget** on the Summary page.

### FCO Log (Field Change Orders)

Field-originated changes, with priority and a work-stopped flag. An FCO can be
**promoted to a CVR** (carrying its details over), and the list can be filtered
to linked/unlinked FCOs.

### RFIs

Requests for information — subject, assigned-to, drawing/spec references, and
status through to answered/closed.

### Trends

Potential/probable cost changes not yet formal CVRs. Their
**probability-weighted** value feeds the **AFC** forecast on the Summary page.

### PCOs (Prime Change Orders)

Owner-facing change orders — owner reference, rep contact, invoice number — the
"sell side" record of a change.

### Notifications

The app sends **outbound email** for relevant events and runs a **daily
reminder** job for items needing attention.

---

## 5. How the estimate and the Change Log stay connected

This is the point of the app — a change isn't just logged, it moves the budget:

1. You build the **estimate** (Field Estimate Form) and snapshot it **as-bid**.
2. **CVRs** you approve add to (or credit) the **Current Budget**, by CBS account.
3. **Open CVRs** show as **Pending** exposure; **Trends** show as a weighted
   forecast — together giving the **AFC**.
4. The **Summary** page reconciles all of this against the as-bid baseline, per
   discipline and CBS account, so at any moment you can see original vs. current
   vs. forecast and where the movement came from.

---

## 6. Admin

Admins configure the shared data the rest of the app draws on:

- **Projects** — create/manage projects and access.
- **Subcontractors** — the sub directory.
- **Areas** — project areas used for take-off area assignment and roll-ups.
- **Roles** — labor roles and their **rates by schedule** (feeds Take Off /
  Support Labor rates).
- **Crew Mixes** — named crews of members with wages; the average drives a row's
  labor rate when "Use Crew Mix" is on.
- **CBS** — the complete CBS, in the same browser as
  the **Project Cost Code List** but with no project allow-list applied and both views, so it shows every
  account including ones no project has been granted. Read-only; the catalog
  changes only through a CBS import. Use it to look an account up before
  granting it on the Setup page. It ignores the selected project entirely.
- **CVR / FCO Templates** — reusable field sets to pre-fill new records.
- **Users** — accounts and roles.
- **System** — system-level settings and maintenance.

---

## 7. Tips

- Most grids **autosave**; there's no explicit save step for the estimate.
- On **Take Off**, work like Excel: **Shift+select** a range and **Ctrl+C /
  Ctrl+V** to move data to and from a spreadsheet, **Ctrl+D** or the fill handle
  to fill down, and **Ctrl+Z** to undo. For a first bulk load, **Paste from
  Excel** is faster than typing rows one by one.
- Keep the estimate **Validation-clean** before snapshotting so your as-bid
  baseline is complete.
- Use **⌘K / /** to jump to any CVR/FCO/RFI/PCO/Trend by number or title.
- The Summary **Baseline** selector is the fastest way to see scope creep — set
  it to your original as-bid snapshot and read the working-estimate delta.
