import type { UserRole } from "~/utils/users";

/**
 * The in-app user guide, as data.
 *
 * Typed content (rather than markdown or JSX) buys three things: the dialog
 * and the `/help` route render one source, role filtering is a pure function
 * over a tree (`~/lib/help-visibility.ts`), and coverage is testable without
 * mounting React.
 *
 * Authoring rules:
 *   - `id` is a URL anchor (`/help#take-off`). Stable forever once shipped —
 *     renaming one breaks every link anyone has saved or pasted in an email.
 *   - `minRole` on a section or a block means "hidden below this privilege".
 *     Omit it for content everyone can use. Filtering is subtractive: a USER
 *     is never shown a greyed-out admin feature, matching the nav.
 *   - Don't hand-list workflow actions — use a `workflow` block. It reads the
 *     real transition maps in `~/utils/workflow.ts` and renders only what the
 *     reader's role may actually do, so the guide can't drift from the app.
 *   - Images live in `public/help/` and are referenced as `/help/<name>.png`.
 *     Capture them against a dev server with the repo's screenshot driver:
 *       node scripts/browser/shot.mjs /piping help-take-off
 *     then move the PNG from `.screenshots/` into `public/help/`.
 */

/** Entities whose lifecycle a `workflow` block can render. */
export type WorkflowEntity = "cvr" | "fco" | "rfi" | "trend" | "pco";

export type HelpBlock = (
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "keys"; rows: { keys: string[]; what: string }[] }
  | { kind: "note"; tone: "tip" | "warn"; text: string }
  | { kind: "image"; src: string; alt: string; caption?: string }
  | { kind: "workflow"; entity: WorkflowEntity }
) & {
  /** Hide this block below the given privilege. Omit for everyone. */
  minRole?: UserRole;
};

export type HelpSection = {
  /** Stable anchor id. Never rename a shipped id. */
  id: string;
  title: string;
  /** Hide this section (and its subsections) below the given privilege. */
  minRole?: UserRole;
  blocks: HelpBlock[];
  /** One level of nesting only — the contents rail assumes at most depth 1. */
  subsections?: HelpSection[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blocks: [
      {
        kind: "p",
        text: "EPC Manager has two halves that stay reconciled with each other. The Field Estimate Form builds a bottom-up cost estimate per discipline — take-off quantities through labor and materials to totals — and captures it as an as-bid snapshot. The Change Log and its related registers track everything that moves the number after award: CVRs, field change orders, RFIs, trends, and owner PCOs.",
      },
      {
        kind: "p",
        text: "The Summary page ties the two together into a living budget: as-bid estimate, plus approved changes, gives the current budget and the forecast.",
      },
    ],
    subsections: [
      {
        id: "signing-in",
        title: "Signing in and access",
        blocks: [
          {
            kind: "ul",
            items: [
              "Sign in with your company account. Access is granted per project — you see only the projects you have been assigned to.",
              "Your role decides what you can do. Every signed-in user can build estimates and raise records; approvers additionally action review and approval steps; administrators configure the shared data the whole app draws on.",
              "If you land on a “Not assigned to any project” screen, an administrator needs to add you to a project.",
            ],
          },
        ],
      },
      {
        id: "project-version",
        title: "Choosing a project and version",
        blocks: [
          {
            kind: "p",
            text: "Almost everything in the app is scoped to the selected project — the estimate, the logs, the budget. Switching projects re-scopes the whole UI, and your choice is remembered between visits.",
          },
          {
            kind: "ul",
            items: [
              "Project selector — in the header on desktop, in the sidebar drawer on smaller screens.",
              "Version selector — sits next to it. See Estimate versions for what a version is and when to make one.",
            ],
          },
        ],
      },
      {
        id: "finding-things",
        title: "Finding things fast",
        blocks: [
          {
            kind: "p",
            text: "Global search covers CVRs, FCOs, RFIs, PCOs, and Trends in the current project. Search by number or title; arrow keys move through results and Enter opens one.",
          },
          {
            kind: "keys",
            rows: [
              { keys: ["Ctrl", "K"], what: "Open global search (⌘K on a Mac)" },
              {
                keys: ["/"],
                what: "Open global search — when you are not typing in a field",
              },
              { keys: ["↑", "↓"], what: "Move through results" },
              { keys: ["Enter"], what: "Open the highlighted record" },
              { keys: ["Esc"], what: "Close search" },
            ],
          },
          {
            kind: "p",
            text: "The sidebar also keeps a per-project Recently viewed list of records you opened, so one click jumps back to them.",
          },
        ],
      },
      {
        id: "navigation",
        title: "Getting around",
        blocks: [
          {
            kind: "ul",
            items: [
              "Top nav — Dashboard, Change Log, FCO Log, RFIs, Trends, PCOs, Reporting. Anything that does not fit your window collapses into a “More” menu.",
              "Sidebar — the Summary group (Summary, Basis, Validation), the disciplines (Civil, Concrete, Steel, Piping, Electrical and the rest), Materials, and Recently viewed.",
              "A warning triangle next to a discipline means its Take Off has rows that cannot compute a cost yet. The Validation page lists them.",
            ],
          },
          {
            kind: "ul",
            minRole: "ADMINISTRATOR",
            items: [
              "Field Estimate Form (Setup) and the Admin group in the sidebar are visible to you as an administrator; other users do not see them.",
            ],
          },
        ],
      },
    ],
  },

  {
    id: "dashboard",
    title: "Dashboard",
    blocks: [
      {
        kind: "p",
        text: "The Dashboard is the per-project overview: budget position, open items across the registers, and recent activity. It is the fastest read on where a project stands without opening a log.",
      },
      {
        kind: "image",
        src: "/help/dashboard.png",
        alt: "The project dashboard showing earned value, change log, FCO and RFI stat cards, and a Needs attention panel.",
        caption:
          "Earned value across the top, then a card row per register, then what needs attention.",
      },
      {
        kind: "p",
        text: "The layout is yours, not the project's. Use Customize to drag widgets into the order you want and hide the ones you do not use — a hidden widget stays in the list so you can re-show it or move it later. Changes apply when you press Save, so you can preview a layout and back out of it.",
      },
    ],
  },

  {
    id: "estimate",
    title: "The Field Estimate Form",
    blocks: [
      {
        kind: "p",
        text: "Open a discipline from the sidebar — Piping, for example. Each discipline has a Take Off tab for quantities and a Field Estimate tab for the labor build-up.",
      },
    ],
    subsections: [
      {
        id: "take-off",
        title: "Take Off",
        blocks: [
          {
            kind: "p",
            text: "The main quantity and cost entry grid. Each row carries:",
          },
          {
            kind: "image",
            src: "/help/take-off.png",
            alt: "The Piping Take Off grid, with the Take Off and Field Estimate tabs, the column-group toolbar, and rows of CBS items with quantities and areas.",
            caption:
              "The Take Off grid on Piping. The toolbar carries undo/redo, the column groups, Use Crew Mix, Paste from Excel, and the running totals.",
          },
          {
            kind: "ul",
            items: [
              "Name — pick the CBS item from the picker. This stamps the row's ID (CBS code) and Unit automatically.",
              "Area — assign the row to a project area. Optional; used for area roll-ups.",
              "Role + Schedule, or Crew Mix — toggle Use Role / Use Crew Mix in the toolbar. Role plus Schedule resolves a Labor Rate from the rate table; a Crew Mix uses the crew's average wage.",
              "Quantity × Labor Factor = Labor Hours. The factor defaults to 1.0 (hours = quantity) until you override it.",
              "Labor Hours × Labor Rate = Total Cost.",
              "Sub — marks subcontracted scope. Enabled only for CBS items flagged as sub.",
            ],
          },
          { kind: "p", text: "Working with rows:" },
          {
            kind: "ul",
            items: [
              "Rows add themselves — as soon as the last row has a computable Total Cost, a fresh blank row appears beneath it, so there is always somewhere to type.",
              "Row checkboxes in the left column mark rows for Create CVR from Selected.",
              "Show / Hide Details collapses the wide detail columns (ID, Unit, rates) for a cleaner take-off view.",
              "Invalid rows — started, but Total Cost cannot be computed — are tinted, counted by the sidebar warning badge, and listed on the Validation page.",
              "The toolbar's errors button shows how many rows on the sheet are in that state; click it to filter the grid down to just those rows, and click it again to show everything. Rows keep their real row numbers while filtered, and stay listed as you fix them so nothing disappears from under your cursor mid-edit.",
              "Edits autosave. There is no save button for the estimate.",
            ],
          },
          {
            kind: "keys",
            rows: [
              { keys: ["Enter"], what: "Commit the cell and move down" },
              { keys: ["Shift", "Enter"], what: "Commit and move up" },
              { keys: ["↑", "↓"], what: "Move between rows" },
              {
                keys: ["←", "→"],
                what: "Move the caret; jumps to the next column at the edge",
              },
              { keys: ["Esc"], what: "Revert the cell to its last saved value" },
              { keys: ["Ctrl", "Z"], what: "Undo the last row edit" },
              {
                keys: ["Ctrl", "Shift", "Z"],
                what: "Redo (Ctrl+Y also redoes)",
              },
            ],
          },
          {
            kind: "note",
            tone: "tip",
            text: "The toolbar's undo and redo buttons do the same as Ctrl+Z / Ctrl+Shift+Z. Each paste, fill, or clear counts as a single undo step, so one Ctrl+Z takes back a whole bulk edit.",
          },
        ],
      },
      {
        id: "range-editing",
        title: "Spreadsheet-style range editing",
        blocks: [
          {
            kind: "p",
            text: "The Take Off grid handles bulk edits the way Excel does, including copying to and from a real spreadsheet.",
          },
          {
            kind: "keys",
            rows: [
              {
                keys: ["Shift", "Click"],
                what: "Extend the selection to the clicked cell",
              },
              {
                keys: ["Shift", "↑", "↓", "←", "→"],
                what: "Extend the selection by keyboard",
              },
              {
                keys: ["Ctrl", "C"],
                what: "Copy the selection as tab-separated text",
              },
              {
                keys: ["Ctrl", "V"],
                what: "Paste a block from the top-left of the selection",
              },
              {
                keys: ["Ctrl", "D"],
                what: "Fill the top row of the selection down",
              },
              { keys: ["Delete"], what: "Clear the writable cells" },
            ],
          },
          {
            kind: "ul",
            items: [
              "Copy takes every column, including the computed ones (ID, Labor Hours, Total Cost) and the Crew Mix name — so a copied block lands intact in Excel or Google Sheets.",
              "Paste spills right and down. If the pasted block is taller than the sheet, new rows are added automatically.",
              "Fill down also works by dragging the fill handle — the small square at the bottom-right corner of the selection.",
            ],
          },
          {
            kind: "p",
            text: "Paste, fill, and clear write to: Description, Notes, Quantity, Labor Factor, Area, Role, Schedule, Name (CBS item), and Crew Mix. Writes keep the row consistent — Quantity or Labor Factor recomputes Labor Hours, Role and Schedule re-resolve the Labor Rate, a Name resolves the CBS code and unit, and a Crew Mix snapshots the crew's average wage onto the rate, clearing Role and Schedule.",
          },
          {
            kind: "note",
            tone: "warn",
            text: "A pasted value that does not match a known Area, Role, Schedule, CBS item, or Crew Mix is skipped rather than written, so a stray cell cannot corrupt a row. The computed columns — ID, Unit, Labor Hours, Labor Rate, Total Cost — and the Sub checkbox are read-only to range edits: they copy out, but paste, fill, and clear skip them.",
          },
        ],
      },
      {
        id: "importing",
        title: "Importing rows from a spreadsheet",
        blocks: [
          {
            kind: "p",
            text: "For a first bulk load, pasting from Excel is faster than typing rows one by one. Copy the block in your spreadsheet, open the paste dialog from the Take Off toolbar, and paste it in — the dialog shows how the columns map before anything is written.",
          },
          {
            kind: "note",
            tone: "tip",
            text: "Names must match CBS items, and Roles and Schedules must match the rate table, for those columns to land. Anything unmatched is left blank for you to fix in the grid.",
          },
        ],
      },
      {
        id: "exporting",
        title: "Exporting",
        blocks: [
          {
            kind: "p",
            text: "Export CSV on a discipline writes the current grid, computed columns included, for use outside the app. The logs have their own export, which respects whatever filters you have applied.",
          },
        ],
      },
      {
        id: "field-estimate-tab",
        title: "Field Estimate — Craft and Support Labor",
        blocks: [
          {
            kind: "p",
            text: "The second tab on each discipline builds the labor picture behind the take-off: craft labor and support labor, with their own rows, rates, and totals feeding the discipline's cost.",
          },
        ],
      },
      {
        id: "materials",
        title: "Materials",
        blocks: [
          {
            kind: "p",
            text: "The Materials page collects material scope across the estimate, typed by material category, and rolls up into the same discipline and CBS totals as labor.",
          },
        ],
      },
      {
        id: "versions",
        title: "Estimate versions",
        blocks: [
          {
            kind: "p",
            text: "A version is a named, independently editable revision of a project's estimate. Each version owns its own take-off rows and basis inputs, so editing one never touches another. Use versions for “what if we self-perform the steel”, or for a re-bid, rather than overwriting the estimate you already issued.",
          },
          {
            kind: "ul",
            items: [
              "Create a version from the version selector, optionally copying an existing version as its starting point.",
              "Version numbers are assigned per project and are gap-free, the same way CVR and RFI numbers are.",
              "The selected version is the one every estimate page reads and writes — check it before a bulk edit.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            text: "Rates are frozen per version, so later changes to the global rate book cannot retroactively move an estimate you have already issued.",
          },
        ],
      },
      {
        id: "setup",
        title: "Setup (administrators)",
        minRole: "ADMINISTRATOR",
        blocks: [
          {
            kind: "p",
            text: "Setup is project configuration: which CBS accounts a project uses and the defaults the discipline pages inherit. Only administrators see or reach it, and the disciplines a project shows in the sidebar follow from what you allow here.",
          },
        ],
      },
    ],
  },

  {
    id: "summary",
    title: "Summary, Basis & Validation",
    blocks: [],
    subsections: [
      {
        id: "summary-page",
        title: "Summary — the living budget",
        blocks: [
          {
            kind: "p",
            text: "Summary reconciles the estimate against everything that has happened since, per discipline and CBS account: the as-bid baseline, approved changes, the current budget, pending exposure from open CVRs, the probability-weighted trend forecast, and the resulting AFC.",
          },
          {
            kind: "image",
            src: "/help/summary.png",
            alt: "The Summary page, with a Disciplines table of quantities, hours, rates, labor, material and total cost, and an Indirects table below it.",
            caption:
              "Disciplines roll up first, then indirects. A discipline carrying invalid rows is flagged inline.",
          },
          {
            kind: "note",
            tone: "tip",
            text: "The Baseline selector is the fastest way to see scope creep — point it at your original as-bid snapshot and read the delta against the working estimate.",
          },
        ],
      },
      {
        id: "basis",
        title: "Basis",
        blocks: [
          {
            kind: "p",
            text: "The Basis page records the assumptions the estimate rests on — the inputs, exclusions, and qualifications you would want in front of you when defending the number months later. Basis inputs belong to the selected version.",
          },
        ],
      },
      {
        id: "validation",
        title: "Validation",
        blocks: [
          {
            kind: "p",
            text: "Validation is the pre-flight check on the estimate. It lists rows that were started but cannot compute a cost — the same rows the sidebar warning badge counts — alongside the development-documentation checklist and the estimate-readiness questions.",
          },
          {
            kind: "note",
            tone: "tip",
            text: "Clear Validation before you snapshot, so the as-bid baseline is complete rather than complete-except-for-eleven-rows.",
          },
        ],
      },
      {
        id: "snapshots",
        title: "Snapshots and baselines",
        blocks: [
          {
            kind: "p",
            text: "A snapshot freezes the estimate as a baseline. The Summary budget is measured against a snapshot, and taking snapshots over time lets you compare where the estimate has moved and why.",
          },
        ],
      },
    ],
  },

  {
    id: "reporting",
    title: "Reporting",
    blocks: [
      {
        kind: "p",
        text: "Earned-value reporting: periods with CPI and SPI, an S-curve, and cost bucketed by discipline — the progress view to take into a project review.",
      },
    ],
  },

  {
    id: "change-management",
    title: "Change management",
    blocks: [
      {
        kind: "p",
        text: "Five registers — CVRs, FCOs, RFIs, Trends, and PCOs — share one shell, so once you know one you know them all. What differs is the lifecycle each runs through.",
      },
    ],
    subsections: [
      {
        id: "logs-common",
        title: "What every log shares",
        blocks: [
          {
            kind: "ul",
            items: [
              "List and filters — free-text search plus Status and, where it applies, Discipline. Stat cards summarize counts and cost at the top.",
              "Create and edit through a dialog. Numbers auto-assign per project (CVR-001, FCO-001, RFI-001, PCO-001, TR-001) — leave the number blank for the next one, or type your own.",
              "Custom columns — add the fields you care about to the table, reorder them, and remove them. An undo bar catches a removal you did not mean.",
              "Status workflow — records advance through a defined set of statuses. Which actions you see depends on your role and on whether you originated the record.",
              "Bulk actions — tick rows to apply a status transition to many at once. The floating action bar shows only what applies to your selection.",
              "Export CSV of the current, filtered list.",
              "Print and PDF views for individual CVRs, FCOs, and RFIs.",
            ],
          },
          {
            kind: "image",
            src: "/help/change-log.png",
            alt: "The Change Log list: stat cards for total items, open, executed and cost impact, a filter row, and a table of CVRs with status badges.",
            caption:
              "Every register follows this shape — stat cards, filters, then the table. Learn one and you know all five.",
          },
          {
            kind: "note",
            tone: "warn",
            minRole: "ADMINISTRATOR",
            text: "Bulk delete and Void are administrator actions and are not offered to other users.",
          },
        ],
      },
      {
        id: "cvr",
        title: "Change Log (CVRs)",
        blocks: [
          {
            kind: "p",
            text: "The core change register. A CVR carries cost, schedule, and labor-hour impact, risk, originator and approver, affected CBS codes, and an optional Cost Buildup — line items of quantity × unit rate, typed by cost category, whose subtotal becomes the CVR's cost impact. Templates pre-fill common changes. Approved CVRs move the Current Budget on the Summary page.",
          },
          { kind: "workflow", entity: "cvr" },
        ],
      },
      {
        id: "fco",
        title: "FCO Log (Field Change Orders)",
        blocks: [
          {
            kind: "p",
            text: "Field-originated changes, with a priority and a work-stopped flag. An FCO can be promoted to a CVR, carrying its details over, and the list can be filtered to linked or unlinked FCOs.",
          },
          { kind: "workflow", entity: "fco" },
        ],
      },
      {
        id: "rfi",
        title: "RFIs",
        blocks: [
          {
            kind: "p",
            text: "Requests for information — subject, assigned-to, drawing and spec references, through to answered and closed. RFIs are question-and-answer rather than approval-driven, so any signed-in user can move one along. The one restriction is that the person who asked cannot also post the answer.",
          },
          { kind: "workflow", entity: "rfi" },
        ],
      },
      {
        id: "trends",
        title: "Trends",
        blocks: [
          {
            kind: "p",
            text: "Potential or probable cost changes that are not yet formal CVRs. Their probability-weighted value feeds the AFC forecast on Summary, which is why endorsing a trend is a gated step rather than a free edit. A trend that becomes real is promoted to a CVR, which creates the CVR and links it in one action.",
          },
          { kind: "workflow", entity: "trend" },
        ],
      },
      {
        id: "pco",
        title: "PCOs (Prime Change Orders)",
        blocks: [
          {
            kind: "p",
            text: "Owner-facing change orders — owner reference, rep contact, invoice number: the sell-side record of a change, tracked from submission through negotiation, approval, invoicing, and payment.",
          },
          { kind: "workflow", entity: "pco" },
        ],
      },
      {
        id: "attachments-comments",
        title: "Attachments, comments and history",
        blocks: [
          {
            kind: "p",
            text: "Every record's dialog carries side tabs for attachments and comments, plus a timeline of what changed, when, and who changed it. Put the backup — the markup, the quote, the email — on the record itself rather than in a folder nobody else can find.",
          },
        ],
      },
      {
        id: "notifications",
        title: "Notifications and email",
        blocks: [
          {
            kind: "p",
            text: "The bell in the header is your inbox for workflow events on records that concern you. Clicking one marks it read and takes you to the relevant list; Mark all read clears the badge.",
          },
          {
            kind: "p",
            text: "Where the server has email delivery configured, the same events can also reach you by email, and a daily reminder job chases items needing attention. The email toggle sits in the bell's dropdown and is per-user — turning it off affects only you.",
          },
        ],
      },
    ],
  },

  {
    id: "approvals",
    title: "Reviewing and approving",
    minRole: "APPROVER",
    blocks: [
      {
        kind: "p",
        text: "As an approver you see review and approval actions other users do not: advancing a CVR to approval, approving or rejecting it, sending it back for rework, endorsing a trend as probable, and approving or negotiating a PCO. The buttons appear on the record's dialog and in the bulk action bar when a selection allows them.",
      },
      {
        kind: "note",
        tone: "warn",
        text: "No self-sign-off. On the steps that matter — approve, reject, mark a trend probable — you cannot action a record you originated; someone else with approval rights has to. If an expected button is missing on your own record, that is why.",
      },
      {
        kind: "p",
        text: "Sending a record back is not a rejection: it returns the record to the previous state so the originator can revise and resubmit, and the history keeps both steps.",
      },
    ],
  },

  {
    id: "how-connected",
    title: "How the estimate and the Change Log connect",
    blocks: [
      {
        kind: "p",
        text: "This is the point of the app — a change is not just logged, it moves the budget.",
      },
      {
        kind: "steps",
        items: [
          "You build the estimate in the Field Estimate Form and snapshot it as-bid.",
          "CVRs you approve add to — or credit — the Current Budget, by CBS account.",
          "Open CVRs show as pending exposure; trends show as a weighted forecast. Together they give the AFC.",
          "Summary reconciles all of it against the as-bid baseline, per discipline and CBS account, so at any moment you can see original versus current versus forecast, and where the movement came from.",
        ],
      },
    ],
  },

  {
    id: "admin",
    title: "Administration",
    minRole: "ADMINISTRATOR",
    blocks: [
      {
        kind: "p",
        text: "Administrators configure the shared data the rest of the app draws on. Everything here is global or project-level setup rather than day-to-day work, and changes reach every user immediately.",
      },
    ],
    subsections: [
      {
        id: "admin-projects-users",
        title: "Projects and users",
        minRole: "ADMINISTRATOR",
        blocks: [
          {
            kind: "ul",
            items: [
              "Projects — create and manage projects.",
              "Users — set each user's role and the projects they may access. A user with no assigned projects sees the “not assigned” screen; administrators implicitly reach every project regardless of the list.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            text: "Roles are cumulative: Approver adds the review and approval steps to what a User can do, and Administrator adds configuration, Void, and bulk delete on top of that.",
          },
        ],
      },
      {
        id: "admin-rates",
        title: "Roles, schedules and crew mixes",
        minRole: "ADMINISTRATOR",
        blocks: [
          {
            kind: "ul",
            items: [
              "Roles — labor roles and their rates by schedule. This is the rate book Take Off and Support Labor resolve against. A role appears in a discipline's Role dropdown only if that discipline is listed on the role.",
              "Schedules — the shift patterns rates are keyed on. Renaming or deleting one reaches the rates keyed to it.",
              "Crew Mixes — named crews of roles with head counts. The head-count-weighted average rate at the mix's schedule is what a take-off row picks up when Use Crew Mix is on.",
            ],
          },
          {
            kind: "note",
            tone: "warn",
            text: "Rates are snapshotted onto rows as they are entered and frozen per estimate version, so editing the rate book does not retroactively rewrite existing estimates. Create a new version when you want new rates applied.",
          },
        ],
      },
      {
        id: "admin-project-data",
        title: "Areas, subcontractors and templates",
        minRole: "ADMINISTRATOR",
        blocks: [
          {
            kind: "ul",
            items: [
              "Areas — the project areas take-off rows are assigned to, and the basis of area roll-ups.",
              "Subcontractors — the sub directory used across the estimate and the logs.",
              "CVR and FCO Templates — reusable field sets that pre-fill a new record. Worth building for the changes your projects raise over and over.",
            ],
          },
        ],
      },
      {
        id: "admin-system",
        title: "System",
        minRole: "ADMINISTRATOR",
        blocks: [
          {
            kind: "p",
            text: "System-level settings and maintenance, including the reminder job that chases items needing attention.",
          },
          {
            kind: "note",
            tone: "warn",
            text: "Deleting an estimate version is an administrator action and removes that version's rows and basis inputs. Snapshot or export first if there is any chance the numbers are wanted later.",
          },
        ],
      },
    ],
  },

  {
    id: "tips",
    title: "Tips",
    blocks: [
      {
        kind: "ul",
        items: [
          "Most grids autosave — there is no explicit save step for the estimate.",
          "On Take Off, work like Excel: Shift-select a range, Ctrl+C and Ctrl+V to move data to and from a spreadsheet, Ctrl+D or the fill handle to fill down, Ctrl+Z to undo.",
          "Keep the estimate Validation-clean before snapshotting so the as-bid baseline is complete.",
          "Use Ctrl+K (⌘K) or / to jump straight to any CVR, FCO, RFI, PCO, or Trend by number or title.",
          "Check the version selector before a bulk edit — it decides which revision of the estimate you are typing into.",
          "Attach the backup to the record, not to an email. The next person to open the CVR will look on the record.",
        ],
      },
    ],
  },
];
