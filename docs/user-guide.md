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
| **Cost Breakdown Structure**  | The cost code library — this project's list, and the full catalog                |
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
differ in what they list and what you can do there, but the controls are the
same on all three, so they are described once here.

**Level colors.** The tree is colored by code level, the way the source
workbook colors it. The **L0–L5 swatches** under "Level colors" are buttons:
click one to open the whole tree to that level and no deeper — **L0** collapses
to the discipline roots, **L5** is the same as **Expand all**. The swatch in
force is outlined, and the outline clears once you open or close a row
yourself.

**Search** matches the code, the name, the account description and the unit.
Terms are order-free and all required, so "rental pipe" finds "Pipe Shop Third
Party Rental", and a code typed without its dashes ("60420") finds its row —
useful when pasting from the workbook's **Cost Code** column or from Excel. A
plain text search keeps the parents of a hit, because knowing where a hit sits
is most of the answer.

**Cost types** — **Labor**, **Subcontracts**, **Materials**, **Equipment** and
**Other** — narrow the tree to one kind of code. The buttons widen each other,
so turning two on shows either kind, and they narrow the search rather than
widening it: "pumps" with **Subcontracts** on means subcontract rows mentioning
pumps.

What counts as "that kind of code" depends on what the page lists, and the
difference is worth knowing:

- A page listing **accounts** — Setup, the Project Cost Code List, and the Code
  Book's **Cost Accounts** — counts a row if its own cost type is the matching
  letter **or** its corresponding column (**Labor Code**, **Sub Code**,
  **Material Code**, **Equipment Code**, **Other Code**) is YES. Those pages
  are built around codes ending in **0**, whose own cost type can never match,
  so the columns are what answer for them.
- A page listing **cost lines** — the Code Book's **CBS Dictionary** — counts a
  row on **its own cost type and nothing else**. Filter on **Materials** there
  and you get the codes ending in **M**: not the **S** row of an account that
  happens to carry a material code, and not the **0** roll-up above them.

So the same button asks "which accounts have material?" on one page and "which
codes _are_ material?" on the other.

A cost-type filter is **strict** everywhere: only rows carrying that type
survive, and a parent that does not carry it is dropped with its matching
children lifted into its place. That is deliberate — a parent kept only to hold
children would show no badge and would read as a code that is not of that kind.

**Badges under a filter.** Where a page shows the **L / S / M / E / O** badges,
a cost-type filter narrows them to the types you selected. Filter on
**Materials** and a row carrying both labor and material shows just **M**; turn
**Subcontracts** on as well and it shows **S M**. Every row on screen has
already earned its place on the filtered type, so the other letters only invite
reading the row as something it is not here for. Clear the filter and the full
set comes back.

**Status** — **Active**, **Inactive**, **Retired** — narrows the tree the same
strict way the cost types do. A blank Status counts as **Active**: roughly 190
live accounts have never had the cell filled in, section summaries among them,
so treating blanks as retired would hide their children's parents. The row of
buttons appears only where a list actually holds more than one status, which is
why Setup and **Cost Accounts** don't show it — both are active-only, and a
filter with one option is just noise.

**Selecting a row** opens its full detail in the panel on the right: unit, cost
code, account, cost classification, discipline, description, and the **Row** and
**Expanded Row** it occupies in the source workbook.

**Linking to one code.** All of these pages accept a `?code=` link — for example
`/project-cost-codes?code=052-15-0500-00-L`. Opening it expands the tree down to
that account, selects it so the detail panel fills, and scrolls it into view.
Useful for pointing someone at a specific code in an email rather than
describing where to find it. An unknown code is ignored and the page opens
normally.

**Export Excel** downloads what you are looking at — the rows left by the search
box and the filter buttons, and nothing else. The sheet opens with a labeled
block giving the **project number** and **project title**, what the rows cover,
the filter applied, the code count and the export date; the project number is in
the filename too, so forwarded files can be told apart. The file keeps the level
colors and turns the hierarchy into Excel's own row grouping, so the ± controls
in the margin collapse it the way the page does. Collapsing branches on screen
doesn't change the file — Excel's grouping is what collapses it there. Each page
exports by its own rules, so the file always matches the screen.

### Setup (admins)

Project configuration — which **CBS items** a project may use. This controls
which disciplines appear in the sidebar and which items the pickers offer.

The tree is the full CBS Dictionary. **Ticking a parent allows everything
beneath it**; a half-filled box means only some of its children are allowed.
Clicking a row only opens its detail — ticking its checkbox is what changes the
allow-list.

Setup lists **active codes only**; a retired code cannot be granted. Rows badged
**S** or **M** are the generated subcontract and material versions of the row
above them — allow those too if the project will book cost against them.

> **Saving:** edits autosave as you go (debounced). No "Save" button to hunt
> for.

> **After a CBS update:** new codes are never granted automatically. Come back
> here and allow the new items each project needs, or its pickers won't offer
> them.

### Project Cost Code List

A read-only list of the cost codes available on the selected project — exactly
what an admin allowed in **Setup**. Nothing on this page changes the estimate or
the allow-list.

Only the **original** CBS rows are listed. **S** means a code's own **Sub Code**
is YES, **M** means its **Material Code** is YES, and a code carrying both shows
both. The generated subcontract and material rows are not listed here, since
those badges already tell you which codes have them; administrators can see both
views over the whole CBS under **Cost Breakdown Structure → CBS Code Book**.

Grayed-out, italic rows are **parent summaries the project wasn't granted**,
shown only so the codes beneath them sit in the right place in the hierarchy.
They carry no badges, aren't counted in the row count, and don't appear in the
Field Estimate Form's code pickers — they are not codes you can use. To make one
usable, tick it in **Setup**.

**Hide ungranted parents** drops those rows and lifts their granted children up
to the nearest parent the project does hold, leaving only codes that can
actually be used. The toggle appears only when there are some to hide, and
**Export Excel** follows it — with the toggle on, the file leaves them out too
and says so on its Scope line.

### CBS Code Book (administrators)

The whole catalog, no project allow-list applied, in two sections:

- **Cost Accounts** — one row per account: the codes ending in **0**, and
  **active ones only**. The **L / S / M / E / O** badges say which cost types
  that account carries, so its priced variants need no separate rows.
- **CBS Dictionary** — every row, each cost type on its own line, including
  retired codes. This is the one view that hides nothing, so a code you cannot
  find anywhere else is findable here. It carries no cost-type badges: each
  row's own code already ends in its cost type, so a badge would only repeat it.

These two sections are the pair whose cost-type filters behave differently —
accounts versus cost lines, as described under **Working with the CBS tree**
above. Each section's **Export Excel** follows its own section's rule.

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

Each failing check lists every affected row with the **Row** it occupies in the
master spreadsheet, sorted ascending, and exports to Excel as a worklist with
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
