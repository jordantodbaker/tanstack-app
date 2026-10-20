# EPC Manager — Production Deployment Brief

A handoff document for IT covering everything required to stand up a production
environment for the EPC Manager application. Each section describes one
component, what it's used for, what to provision, and what to configure.

---

## 1. Application overview

**EPC Manager** is an internal web application for an EPC (Engineering,
Procurement, Construction) firm. It manages:

- Field Estimate Forms (per-discipline take-off sheets)
- Change Variation Requests (CVR) and the approval workflow
- Field Change Orders (FCO), Requests for Information (RFI), Trends, and
  Prime/Owner Change Orders (PCO)
- The Cost Breakdown Structure — five pages, with Excel export from each:
  the project's cost code list, the whole CBS Code Book, the Core Code
  Roll-up (how codes across disciplines link to shared core accounts), Code
  Usage (granted against actually used) and CBS Health (the catalog's
  data-quality checks)
- Project administration (projects, areas, subcontractors, users, roles,
  crew mixes, CVR/FCO templates)
- Earned-Value-Management (EVM) reporting against estimate snapshots
- Cross-entity command-palette search (Cmd+K)
- File attachments (photos, drawings, PDFs)
- Per-record audit history, comments, and notifications

**Navigation is split into five apps**, registered in
[apps.ts](../src/config/apps.ts): Field Estimate Form, Change Log, Cost
Breakdown Structure, Reporting and Administration. `appForPath` resolves the
current route to its app and the shell renders only that app's navigation; the
home page is a launcher with one card per app. An app is a grouping of
existing routes rather than a URL prefix, so the emailed deep links in
[entity-routes.ts](../src/lib/entity-routes.ts) are unaffected by the
grouping.

**Stack:** TanStack Start (React 19, Server Functions), Prisma 7 + PostgreSQL,
Clerk authentication, Vercel Blob for object storage, Resend for outbound
email, Sentry for error tracking, Vercel Cron for the daily reminder pass,
exceljs for the CBS workbook import and the Excel export (a runtime
dependency — it is used by server functions, not just by the import script,
and is deliberately kept out of the client bundle).
Deployed today as a serverless Node bundle on Vercel; portable to any
Node-capable serverless platform with minor changes to
[api/handler.js](../api/handler.js).

**Scale assumption:** Internal tool for a single company. Expect 10–100 active
users, dozens of concurrent projects, thousands of CVR/FCO/RFI records per
active project at maturity. Not internet-scale.

---

## 2. Hosting platform

### What it does

Runs the production build of the app — serves the static client bundle from
edge / CDN and routes API + server-function calls to a Node serverless
function.

### Currently

Vercel. Configuration lives in [vercel.json](../vercel.json) and the
Node↔Web-Fetch adapter in [api/handler.js](../api/handler.js).

### What IT needs to provision

- One Vercel project (or equivalent: Cloudflare Pages + Workers, AWS Lambda
  - CloudFront, Render, Railway, Google Cloud Run)
- Custom production domain — e.g. `epc-manager.companyname.com`
- TLS certificate (auto-provisioned on Vercel / Cloudflare; AWS needs ACM)
- Region: single region close to the user base is sufficient

### Configuration

| Setting                   | Value                                               |
| ------------------------- | --------------------------------------------------- |
| Build command             | `npm run build`                                     |
| Output directory          | `dist/client`                                       |
| Serverless function entry | `api/handler.js`                                    |
| Node runtime              | 20+ (required by `@prisma/adapter-pg` and Prisma 7) |
| Function memory           | 1024 MB                                             |
| Function timeout          | 30 s                                                |

### Notes

- The build emits a static client bundle (`dist/client`) and a Node server
  bundle (`dist/server`) that the serverless function imports.
- Cold-start time is acceptable for an internal tool; no warm-pool needed.
- **Nothing in the repo is readable from the deployed server.** `dist/` holds
  the bundles and nothing else, and a path built from `import.meta.url`
  resolves inside `dist/server`, not the source tree. `prisma/data/CBS.xlsx` is
  a working file on somebody's machine, not part of the deployment.
  CBS Health is the only feature that wants it at run time; it treats the
  workbook as optional and reports its four workbook-versus-database checks as
  skipped when the file is absent, leaving the other eighteen to run. Anything
  else that reads a repo file at run time will fail on Vercel and pass locally
  — the failure mode that produced "Failed to run the CBS health checks".

---

## 3. PostgreSQL database

### What it does

Stores everything except attachments: projects, users, all change-management
entities (CVR / FCO / RFI / Trend / PCO), reporting periods, audit log,
comments, notifications, and the CBS catalog.

### Currently

Neon serverless Postgres (US East). Connection string is supplied to the
runtime via `DATABASE_URL`.

### What IT needs to provision

- Managed Postgres instance: Neon, AWS RDS, Cloud SQL, Azure Database, or
  on-prem Postgres 15+
- Connection pooling — required on serverless platforms. Neon's built-in
  pooler is fine; on RDS use PgBouncer in transaction mode.
- Sizing: start at 1–2 vCPU / 4 GB RAM. Schema is ~25 tables; storage grows
  primarily from the audit log and comments.
- Backups: daily snapshots + point-in-time recovery (PITR). Neon has both
  by default; on RDS, enable PITR with at least a 7-day window.

### **Required Postgres extension**

**`pg_trgm` must be installed before first deploy.** The schema declares
GIN trigram indexes on the searched columns of five entity tables (used by
the Cmd+K command palette). Without `pg_trgm`, `prisma db push` fails and
search performance degrades to sequential scans.

- **Neon:** the extension must be on the project's allow-list. If you see
  `extension "pg_trgm" is not in the allowed extensions list`, enable it
  from the Neon dashboard or open a support request.
- **RDS / Cloud SQL:** the deploy role needs `CREATE EXTENSION` permission.
  Most managed Postgres providers ship `pg_trgm` as a preinstalled
  extension — confirm in the provider's docs.
- **On-prem:** install the `postgresql-contrib` package, then `CREATE
EXTENSION pg_trgm`.

The deploy script verifies the extension is present and 20 trigram indexes
exist on the searched columns:
[scripts/verify-trigram-indexes.ts](../scripts/verify-trigram-indexes.ts).

### Schema migrations

> **After any schema change, restart the dev server.** Node caches the Prisma
> client at import, and Vite's HMR updates your source but not that module, so
> a freshly added column reads as `Unknown field … for select statement` until
> the process restarts. A column genuinely missing from the database says
> `The column … does not exist in the current database` instead — the two look
> identical in the UI and are fixed differently. `npx prisma db push` the other
> database too; the two Neon branches drift apart otherwise.

The codebase uses `prisma db push` (no migration history table). Schema
changes are applied by running `npx prisma db push` against the production
`DATABASE_URL`. There is no down-migration path; schema changes are
forward-only.

### Notes

- The connection string must point at the pooler endpoint, not the direct
  Postgres host. Serverless functions exhaust direct-connection slots
  quickly otherwise.
- Storage estimate at maturity: ~1 GB of relational data per 100 active
  projects (audit log dominates). File attachments are in Blob storage,
  not the DB.

---

## 4. Object storage (file attachments)

### What it does

Stores user-uploaded files (photos, scanned drawings, marked-up PDFs,
Excel takeoffs) attached to CVRs / FCOs / RFIs / Trends / PCOs.

### Currently

Vercel Blob. Per-file cap: 25 MB. Total storage grows with usage; expect
hundreds of files per active project.

### What IT needs to provision

- Vercel Blob store (default if staying on Vercel), **or**
- AWS S3 bucket + CloudFront distribution, **or**
- Cloudflare R2, Google Cloud Storage, etc.

### Configuration

- The connection token / credentials are passed in via
  `BLOB_READ_WRITE_TOKEN` (or equivalent env vars if migrating to S3).
- The application stores the full upload URL (with a random suffix) as the
  attachment's `storageKey`. Public-read on the bucket is acceptable
  because URLs are unguessable AND downloads still proxy through
  `requireProjectAccess`. The random suffix is defense in depth.

### Notes

- If migrating off Vercel Blob, only three functions change:
  `writeAttachmentFile` / `readAttachmentFile` / `deleteAttachmentFile` in
  [attachments.server.ts](../src/utils/attachments.server.ts). The shape of
  `storageKey` (a public URL) stays the same.

---

## 5. Authentication — Clerk

### What it does

Handles user sign-up, sign-in, password recovery, session management, and
invitation flows. The application reads `clerkId` from the session and
lazy-syncs a corresponding `User` row in our DB on first authenticated
request.

### Currently

Clerk development instance. **A separate Clerk production instance must
be provisioned for production** — dev instances send emails from
`accounts.dev` and redirect back to localhost, which breaks invite flows.

### What IT needs to provision

- **Clerk production application** (separate from dev)
- **Custom Clerk domain** — e.g. `clerk.epc-manager.companyname.com`,
  CNAME'd to Clerk's frontend API host (Clerk provides the target in the
  dashboard). Required so production invite emails point at the production
  app, not localhost.
- **Allowed origins** including the production app domain
- **Verified email sender** on company domain
  (e.g. `noreply@epc-manager.companyname.com`) so invite / password-reset
  emails come from a recognizable address

### Configuration

| Setting                     | Value                                        |
| --------------------------- | -------------------------------------------- |
| `pk_live_*` publishable key | Surfaced to the client bundle                |
| `sk_live_*` secret key      | Server-side only, never logged               |
| Auth methods                | Email + password (or company SSO if desired) |
| JWT template                | Default — no custom template required        |

### Bootstrap admin

The very first sign-in is granted ADMINISTRATOR via a hardcoded email
allow-list in
[users.server.ts](../src/utils/users.server.ts) — currently
`jordantodbaker@gmail.com`. **IT must change this to a real production
admin email before the first deploy.** After the first admin is in, they
promote subsequent admins from the UI; the bootstrap list is only used to
seed the first one.

---

## 6. DNS configuration

| Record                              | Type      | Target                          |
| ----------------------------------- | --------- | ------------------------------- |
| `epc-manager.companyname.com`       | A / CNAME | Hosting platform (Vercel, etc.) |
| `clerk.epc-manager.companyname.com` | CNAME     | Provided by Clerk dashboard     |

TLS certificates are auto-provisioned by Vercel / Cloudflare. On AWS,
provision through ACM and attach to CloudFront.

---

## 7. Environment variables

All variables are read from the platform's environment at runtime. None
should be committed to the repo. The `.env` file is gitignored.

### Required

| Variable                     | Source            | Purpose                                                                                                                                         |
| ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | Postgres provider | Pooled connection string                                                                                                                        |
| `CLERK_SECRET_KEY`           | Clerk dashboard   | Server-side auth                                                                                                                                |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk dashboard   | Client-side auth. Read at **build** time and baked into the client bundle, so it must be set on the build environment, not just the runtime one |
| `BLOB_READ_WRITE_TOKEN`      | Blob provider     | File attachment R/W                                                                                                                             |
| `NODE_ENV`                   | Platform          | Must be `production`                                                                                                                            |

### Optional — Sentry error tracking (wired up)

Error tracking is integrated via `@sentry/tanstackstart-react`. It is a **no-op
until a DSN is set**, so these are optional; set them to turn it on. Session
Replay and performance tracing are intentionally **disabled** — Replay would
record the on-screen contractor names / cost figures (see §10 data
classification), so the integration captures errors only, with request bodies
and server-fn inputs scrubbed before send ([sentry-options.ts](../src/lib/sentry-options.ts)).

| Variable                        | Scope                       | Purpose                                                                              |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `SENTRY_DSN`                    | Server runtime              | Server-side error capture (server functions, SSR)                                    |
| `VITE_SENTRY_DSN`               | Client (build-time, public) | Browser error capture. Same DSN value; DSNs are not secrets                          |
| `SENTRY_AUTH_TOKEN`             | **Build only**              | Enables source-map upload. Omit and you still get errors, just minified stack traces |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Build only                  | Org + project slugs for the source-map plugin                                        |

### Optional — Outbound email (wired up)

Notification email is **fully gated on `RESEND_API_KEY` + `EMAIL_FROM`**: with
either unset the app sends no email and only writes the in-app inbox (no
errors). Sends are best-effort and never block the action that triggered them.
Per-user opt-out is respected (a toggle in the notification bell).

| Variable         | Source                | Purpose                                                                              |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `RESEND_API_KEY` | Resend dashboard      | Enables outbound notification email                                                  |
| `EMAIL_FROM`     | You (verified domain) | Sender, e.g. `EPC Manager <notify@companyname.com>`                                  |
| `EMAIL_REPLY_TO` | Optional              | Reply-To header on notification emails                                               |
| `APP_BASE_URL`   | You                   | Public URL (`https://epc-manager.companyname.com`) for "open in app" links in emails |

Provision a **Resend account + verified sending domain** before setting these.

### Daily reminder cron

| Variable      | Source              | Purpose                                                                                                               |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET` | You (random secret) | Guards `/api/cron/reminders`; Vercel injects it as the cron's `Authorization` header. Required in production — see §8 |

### Secret management

Use the hosting platform's secrets manager (Vercel Environment Variables,
AWS Secrets Manager, etc.). Do **not** check secrets into the repo or pass
them through CI logs.

---

## 8. Daily reminder cron

### What it does

Once per day, scans for CVRs / FCOs / RFIs awaiting approval, past their
due date, or stuck in a workflow state, and dispatches in-app notifications
(and email copies, when email is configured per §7) to the relevant
approvers / originators. Implementation:
[reminders.ts](../src/utils/reminders.ts) + [reminders.server.ts](../src/utils/reminders.server.ts).

### Current behavior (wired up — Vercel Cron)

Driven by **Vercel Cron**, configured in [vercel.json](../vercel.json):
`{ "path": "/api/cron/reminders", "schedule": "0 14 * * *" }`. Vercel GETs that
path on schedule; the catch-all rewrite routes it to the SSR handler, where the
[/api/cron/reminders](../src/routes/api.cron.reminders.tsx) route loader runs
`runScheduledReminders()` via the `CRON_SECRET`-guarded `runRemindersCronFn`.

The in-process `node-cron` in [cron.ts](../src/server/cron.ts) is retained as a
fallback for long-running / non-serverless hosts; on Vercel it never fires
(frozen instances) and is harmless.

### What IT needs to set up

- **Set `CRON_SECRET`** (§7). Vercel sends it as `Authorization: Bearer
<CRON_SECRET>`; the endpoint 401s on anything else. Unset = guard skipped
  (acceptable for dev only).
- **Adjust the schedule if needed.** Vercel crons run in **UTC** — `0 14 * * *`
  ≈ 07:00 Pacific. Edit `vercel.json`'s `crons` to suit timezone / DST.

The Admin → System page's "Run reminders now" button remains as a manual
trigger. Verify after deploy:
`curl -i -H "Authorization: Bearer $CRON_SECRET" https://<env>/api/cron/reminders`
→ 200 (and → 401 without the header).

---

## 9. Logging & observability

### Application logs

The application logs to stdout via [logger.ts](../src/lib/logger.ts). The
hosting platform should capture stdout and ship to a log aggregator
(Datadog, CloudWatch, Logtail, etc.).

### Metrics

Per-request latency and error rate are exposed by the hosting platform.
Vercel and Cloudflare both surface these in their dashboards.

### Healthcheck

`GET /api/healthcheck` — implemented in [api/healthcheck.js](../api/healthcheck.js).
Pings the database via `pg` (intentionally not Prisma — keeps the endpoint
working even if the application bundle is broken) and returns JSON:

```json
{
  "status": "ok",
  "uptimeSeconds": 0,
  "checks": { "db": { "ok": true, "latencyMs": 12 } },
  "timestamp": "2026-06-05T10:00:00.000Z",
  "durationMs": 14
}
```

- HTTP **200** when every check passes
- HTTP **503** when any check fails (uptime monitors should alert on the
  status code, not parse the body)
- Cache-Control: `no-store` so no CDN ever caches a stale OK
- Vercel routing: `vercel.json` uses a negative-lookahead in its catch-all
  rewrite (`/((?!api/healthcheck).*)` → `/api/handler`) so the function is
  served directly without loading the TanStack Start SSR bundle. Memory
  capped at 256 MB and timeout at 10 s — keeps each ping cheap.

Recommended monitor cadence: every 1–5 minutes. Alert on two consecutive
non-200 responses to avoid paging on a single transient DB blip.

### Recommended (not yet implemented)

- **Sentry** or equivalent for error tracking and stack traces. The
  application currently logs errors but does not group / alert on them.
- Uptime monitoring (Pingdom, StatusCake, UptimeRobot) hitting the
  healthcheck endpoint every 1–5 minutes.

---

## 10. Security & compliance

### Authentication & authorization

- All authentication flows through Clerk.
- All server functions validate inputs at the boundary with Zod schemas
  ([validators.ts](../src/lib/validators.ts)) — no untrusted JSON reaches
  Prisma.
- Every server function is wrapped in one of the guards in
  [users.server.ts](../src/utils/users.server.ts): `projectScopedHandler` /
  `projectIdScopedHandler` (project access), `versionScopedHandler` (resolves
  an estimate version to its project, then the same check — this is what gates
  the take-off sheets), `requireRecordAccess` (reads the owning project off
  the row before authorizing), or `adminHandler` / `adminHandlerNoInput`.
- Role hierarchy: USER → APPROVER → ADMINISTRATOR. Roles are global to the
  user; _project_ access is the per-project allow-list on `User.projects`,
  which administrators bypass.

### Data classification

The application stores:

- User identifiers (email, name from Clerk)
- Free-text fields in CVRs / FCOs / RFIs / comments that may contain
  contractor / owner names, internal cost numbers, drawing references
- File attachments (uploaded photos, drawings, PDFs)
- An append-only audit log of every mutation

No payment card data, no government IDs, no PHI. Standard internal
business data.

### Audit log

Every CREATE / UPDATE / DELETE on a tracked entity writes one
`AuditEvent` row per changed field, with actor email and timestamp. The
audit log is append-only — there's no admin path to modify history. This
satisfies "who changed what when" for downstream contract / audit review.

### Attachment security

Attachment URLs are random-suffixed (defense in depth) AND every download
proxies through the server function's `requireProjectAccess` gate — URL
leakage alone does not grant access.

### Retention

The current schema retains all data indefinitely. If contractual
obligations require purging closed projects after N years, that's a
follow-up feature (a scheduled job marking and removing eligible projects).

---

## 11. First-deploy runbook

1. **Provision Postgres** (Neon / RDS / equivalent). Enable the `pg_trgm`
   extension on the database before first push.
2. **Set up Clerk production app** with a custom domain
   (`clerk.epc-manager.companyname.com`) and verified sender email.
3. **Set up Vercel Blob** (or equivalent object storage).
   3b. **(Optional) Set up Resend** + a verified sending domain if outbound
   notification email is wanted (§7). Skip to ship with in-app inbox only.
4. **Update bootstrap admin email** in
   [users.server.ts](../src/utils/users.server.ts):
   replace `jordantodbaker@gmail.com` with a real production admin email.
5. **Set environment variables** in the hosting platform's secrets store
   (see §7).
6. **First deploy** — push to the production branch.
7. **Verify pg_trgm + trigram indexes** by running
   `npx tsx scripts/verify-trigram-indexes.ts` against the production DB.
   Expected: extension present, 20 trigram indexes across the 5 entity
   tables.
8. **First sign-in** — the bootstrap admin email signs in via Clerk; the
   app creates a User row and auto-grants ADMINISTRATOR.
9. **First project setup** — from Admin → Projects, create the first real
   project. Then Admin → Subcontractors / Areas / Users to populate the
   first project's collaborators.
10. **Set `CRON_SECRET`** for the daily reminder cron (§8) and set up uptime
    monitoring (§9). The cron itself is already wired in `vercel.json` — no
    extra infra to stand up.
11. **Back-fill record-number sequences** — _only if the database already
    contains CVRs / FCOs / RFIs / PCOs / Trends_ (e.g. a restored or migrated
    DB; skip for an empty production DB, where sequences correctly start at 1):
    `DATABASE_URL=<env-url> npm run backfill-numbers` (preview first with
    `-- --dry-run`). Seeds each project's auto-number sequence to continue from
    the highest existing number. Idempotent — safe to re-run.
12. **Smoke-test:** create a CVR (confirm it auto-numbers), transition it
    through the workflow, open the dialog's CBS picker, bulk-approve a couple
    of records, upload an attachment, run the global search — and if email is
    configured, confirm a notification email arrives.

---

## 11a. Updating the CBS

The CBS lives in `prisma/data/CBS.xlsx`. The loader takes the sheet named
"CBS", falling back to "CBS Expanded", "Master CBS" and then to the first sheet
(`SHEET_NAMES` in [cbs-workbook.ts](../prisma/cbs-workbook.ts)). The app
stores the _expanded_ CBS Dictionary in `CbsItem`. Since the 2026-10 workbook
the sheet arrives pre-expanded: every row flagged **Labor**, **Sub**,
**Material**, **Equipment** or **Other Code** already carries its typed
companion, so the loader's own `S`/`M` generation now fills gaps rather than
doing the bulk of the work. On every row it normalizes a summary code written
with four segments (`012-05-0000-00`) by adding the `-0` backbone segment.
Names are stored as the workbook writes them, cost-type marker included
(`Executive (L)`), so the CBS Dictionary shows each line's cost type; the Cost
Accounts list on the CBS Code Book strips the marker because its badges
already show it. A generated twin is skipped when the workbook
already carries that code. Level segments are derived from the Display Code,
not from the workbook's L1–L6 helper columns. See `prisma/cbs-workbook.ts`.

The 2026-10 sheet also carries **Original Row** and **Expanded Row**, stored
on every `CbsItem`: the first is the line in the unexpanded original (a
generated cost-type twin shares it with the account it came from), the second
is the line in the sheet you are reading. They are traced through to the CBS
detail panel and to every CBS Health finding, so a reported problem names the
row to go and fix. Nothing keys on them. Original Row was headed "Master Row"
and before that "Master CBS Row"; the loader still reads either. In the
database the column is still `masterCbsRow` (`@map` in the schema), so the
rename needed no `db push`. The sheet no longer has an `L7` column: the cost
type is the last Display Code segment. **Columns are matched by header name,
never by position**, because columns have been inserted and removed before, and
anything reading by column letter would have written into the wrong cell.

When a new master arrives:

1. Replace `prisma/data/CBS.xlsx` (same sheet/column layout).
   1a. `npm run cbs:repair` — twice now a fresh copy has arrived carrying the same
   two defects, and both are invisible until an import runs: ~1,100 engineering
   Display Codes with their cost type written twice (`022-00-0000-00-0-S`),
   which the loader rejects so the import reads them as _deleted_ and cascades
   every project's grants away; and the 95/96 division renumber. Dry run by
   default, `-- --apply` to write, backs the file up first, and is safe to run
   on a workbook that is already clean. Then `npm run cbs:rename -- --workbook`
   to re-apply account renames the new copy reverted.
2. `npm run cbs:import -- --dry-run` — prints the workbook report (duplicate
   codes, invalid rows, generated-twin counts) and the create/update/delete
   plan without writing anything. Fix the workbook if the report flags
   duplicates you didn't expect.
3. `DATABASE_URL=<env-url> npm run cbs:import` — upserts by cost code so
   existing rows keep their ids and every project's Setup allow-list
   survives. Codes that no longer exist are deleted (and drop out of the
   allow-lists). Brand-new codes, including newly generated S/M twins, are
   NOT auto-added to any project — grant them on the Setup page.
4. `DATABASE_URL=<env-url> npm run piping:sync-codes` (preview with
   `-- --dry-run`) — pushes the piping metallurgy codes from
   `prisma/data/piping_groups.csv` into `PipingGroup.installCode` /
   `shopCode`. Those two columns are what the Piping take-off composes cost
   codes from, and they are NOT derived from the workbook, so a renumbered
   piping series leaves them stale and piping rows silently stop
   auto-populating their CBS id/name. Touches only those two columns.
5. **Re-check the hard-coded code tables below**, then smoke-test one take-off
   page per discipline: pick a CBS item and confirm the id, name and unit
   populate.
6. **Re-apply any account renames** — `npm run piping:sync-codes` aside, the
   import takes every account's name straight from the workbook, so a name
   edited only in the database is reverted. `scripts/rename-cbs-accounts.ts`
   (`npm run cbs:rename`, preview with `-- --dry-run`) holds the renames that
   have been applied this way, each recording the workbook cell the same edit
   belongs in. Fix the workbook and the entry becomes a no-op; the script
   refuses to touch a name that doesn't match what it expects.

The full seed (`prisma db seed`) loads the same workbook but wipes projects
first; use it only for a fresh database.

### Code tables a CBS renumbering invalidates

Several places hold CBS codes that are _not_ read from the workbook at
runtime. A CBS update doesn't fail loudly when these go stale — pickers just
come up empty or auto-population stops — so re-check each one against the new
master. All of them broke on the October 2026 update.

| What                                     | Where                                                                                     | Symptom when stale                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Per-discipline L1 account lists          | `src/config/disciplines-data.ts`                                                          | A discipline's Take Off picker shows almost nothing         |
| Piping metallurgy codes (shop / install) | `prisma/data/piping_groups.csv` → `PipingGroup`                                           | Piping rows don't auto-populate id/name (step 4 above)      |
| Piping cost-code shapes and cost type    | `pipingCostCodes` in `src/lib/piping-derive.ts`                                           | Same, and the doc comment there records the expected shapes |
| Bore-size bands                          | `computeBoreSize` in `src/lib/utils.ts`                                                   | A size bands into a bore series that has no item for it     |
| Materials / support-labor L1 suffixes    | `src/components/DisciplineRoute.tsx`, `src/routes/materials.tsx`, `src/routes/piping.tsx` | Rows land on the wrong sheet                                |

---

## 12. Open items / future work

The following are not blockers for v1 production but should be tracked:

- **Slack / Teams notification delivery** — email is now wired (§7); chat-app
  delivery is still future. Emailing _external_ RFI responders (the free-text
  `assignedTo`, not app users) is also not yet wired
- **Server-side PDF generation** for CVR / FCO / RFI print packets
  (currently relies on the browser print dialog)
- **Retention policy** for closed projects (if contractually required)
- **Procurement (purchase orders, vendor management)** — the "P" in EPC
  is largely absent; would be its own module
- **Original owner-contract value & billing milestones** — PCOs handle
  change-side commerce but not the prime contract base

---

_Document last updated: 2026-10-09._
