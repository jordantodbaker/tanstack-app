# EPC Manager — User Guide

A field-estimating and change-management app for EPC projects. It has two halves
that stay reconciled with each other:

1. **The Field Estimate Form** — build a bottom-up cost estimate per discipline
   (take-off quantities → labor + materials → totals), captured as an **as-bid
   snapshot**.
2. **The Change Log and related registers** — track everything that moves the
   number after award: CVRs, field change orders, RFIs, trends, and owner PCOs.

The **Summary** page ties them together into a *living budget*: as-bid estimate
→ approved changes → current budget → forecast.

---

## 1. Getting started

- **Sign in** with your account (Clerk). Access to a project is granted per user.
- **Pick a project** from the selector in the header (or the sidebar on smaller
  screens). Almost everything in the app is scoped to the selected project — the
  estimate, the logs, the budget. Switching projects re-scopes the whole UI.
- **Roles.** *Administrators* additionally see the **Admin** section and the
  **Field Estimate Form / Setup**. Workflow actions (approving a CVR, etc.) are
  gated by role.

### Finding things fast

- **Global search:** press **⌘K / Ctrl-K** anywhere (or **/** when you're not
  typing in a field). Searches across CVRs, FCOs, RFIs, PCOs, and Trends in the
  current project; arrow keys to move, **Enter** to open.
- **Recently viewed:** the sidebar keeps a per-project list of records you
  opened recently — one click jumps back to them.

### Navigation

- **Top nav:** Dashboard · Change Log · FCO Log · RFIs · Trends · PCOs ·
  Reporting · Field Estimate Form *(admins)*.
- **Sidebar:** Setup, the **Summary** group (Summary · Basis · Validation), the
  **disciplines** (Civil, Concrete, Steel, Piping, Electrical, … plus
  Engineering, Procurement, Administration, etc.), Materials, Recently viewed,
  and the **Admin** group (admins only). A ⚠️ next to a discipline means its
  Take Off has rows that can't compute a cost yet.

---

## 2. The Field Estimate Form

Open a discipline from the sidebar (e.g. **Piping**). Each discipline has two
tabs.

### Take Off

The main quantity/cost entry grid. Per row:

- **Name** — pick the **CBS item** from the picker; this stamps the row's **ID**
  (CBS code) and **Unit** automatically.
- **Area** — assign the row to a project area (optional; used for area roll-ups).
- **Role + Schedule** *or* **Crew Mix** — toggle **Use Role / Use Crew Mix** in
  the toolbar. Role+Schedule resolves a **Labor Rate** from the rate table; a
  Crew Mix uses the crew's average wage.
- **Quantity × Labor Factor = Labor Hours** — the factor defaults to 1.0 (hours =
  quantity) until you override it. **Labor Hours × Labor Rate = Total Cost.**
- **Sub** — mark subcontracted scope (enabled only for CBS items flagged as sub).

Working with rows:

- **Adding rows is automatic:** as soon as the last row has a computable Total
  Cost, a fresh blank row appears beneath it — so there's always a row to type
  into.
- **Duplicate Selected Rows:** tick the checkboxes on one or more rows, optionally
  enter a "times" count, and duplicate them in place.
- **Show / Hide Details:** collapses the wide detail columns (ID, Unit, rates,
  etc.) for a cleaner take-off view.
- **Invalid rows** (started but Total Cost can't be computed) are tinted and
  counted with the ⚠️ badge in the sidebar and on the **Validation** page.

### Field Estimate (Craft Labor + Support Labor)

- **Craft Labor** is derived from your Take Off rows.
- **Support Labor** is entered directly — its **Name** column is a **searchable
  CBS picker** (fills ID, Name, Unit), with Role/Schedule driving the rate and
  Labor Hours entered by hand. It grows the same way Take Off does (a new blank
  row appears once the last one is complete).

### Materials

Per-discipline material lines: pick the CBS item, enter **Quantity × Material
Cost = Total Cost**.

### Setup (admins)

Project configuration — which CBS accounts (L1 codes) are in play for the
project. This controls which disciplines and CBS items appear.

> **Saving:** edits autosave as you go (debounced). No "Save" button to hunt for.

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
- **CVR / FCO Templates** — reusable field sets to pre-fill new records.
- **Users** — accounts and roles.
- **System** — system-level settings and maintenance.

---

## 7. Tips

- Most grids **autosave**; there's no explicit save step for the estimate.
- Keep the estimate **Validation-clean** before snapshotting so your as-bid
  baseline is complete.
- Use **⌘K / /** to jump to any CVR/FCO/RFI/PCO/Trend by number or title.
- The Summary **Baseline** selector is the fastest way to see scope creep — set
  it to your original as-bid snapshot and read the working-estimate delta.
