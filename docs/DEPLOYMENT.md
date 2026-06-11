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
- Project administration (projects, areas, subcontractors, users, roles,
  crew mixes, CVR/FCO templates)
- Earned-Value-Management (EVM) reporting against estimate snapshots
- Cross-entity command-palette search (Cmd+K)
- File attachments (photos, drawings, PDFs)
- Per-record audit history, comments, and notifications

**Stack:** TanStack Start (React 19, Server Functions), Prisma 7 + PostgreSQL,
Clerk authentication, Vercel Blob for object storage. Deployed today as a
serverless Node bundle on Vercel; portable to any Node-capable serverless
platform with minor changes to [api/handler.js](../api/handler.js).

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
  + CloudFront, Render, Railway, Google Cloud Run)
- Custom production domain — e.g. `epc-manager.companyname.com`
- TLS certificate (auto-provisioned on Vercel / Cloudflare; AWS needs ACM)
- Region: single region close to the user base is sufficient

### Configuration
| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist/client` |
| Serverless function entry | `api/handler.js` |
| Node runtime | 20+ (required by `@prisma/adapter-pg` and Prisma 7) |
| Function memory | 1024 MB |
| Function timeout | 30 s |

### Notes
- The build emits a static client bundle (`dist/client`) and a Node server
  bundle (`dist/server`) that the serverless function imports.
- Cold-start time is acceptable for an internal tool; no warm-pool needed.

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
| Setting | Value |
|---|---|
| `pk_live_*` publishable key | Surfaced to the client bundle |
| `sk_live_*` secret key | Server-side only, never logged |
| Auth methods | Email + password (or company SSO if desired) |
| JWT template | Default — no custom template required |

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

| Record | Type | Target |
|---|---|---|
| `epc-manager.companyname.com` | A / CNAME | Hosting platform (Vercel, etc.) |
| `clerk.epc-manager.companyname.com` | CNAME | Provided by Clerk dashboard |

TLS certificates are auto-provisioned by Vercel / Cloudflare. On AWS,
provision through ACM and attach to CloudFront.

---

## 7. Environment variables

All variables are read from the platform's environment at runtime. None
should be committed to the repo. The `.env` file is gitignored.

### Required

| Variable | Source | Purpose |
|---|---|---|
| `DATABASE_URL` | Postgres provider | Pooled connection string |
| `CLERK_SECRET_KEY` | Clerk dashboard | Server-side auth |
| `CLERK_PUBLISHABLE_KEY` | Clerk dashboard | Client-side auth |
| `BLOB_READ_WRITE_TOKEN` | Blob provider | File attachment R/W |
| `NODE_ENV` | Platform | Must be `production` |

### Optional — Sentry error tracking (wired up)

Error tracking is integrated via `@sentry/tanstackstart-react`. It is a **no-op
until a DSN is set**, so these are optional; set them to turn it on. Session
Replay and performance tracing are intentionally **disabled** — Replay would
record the on-screen contractor names / cost figures (see §10 data
classification), so the integration captures errors only, with request bodies
and server-fn inputs scrubbed before send ([sentry-options.ts](../src/lib/sentry-options.ts)).

| Variable | Scope | Purpose |
|---|---|---|
| `SENTRY_DSN` | Server runtime | Server-side error capture (server functions, SSR) |
| `VITE_SENTRY_DSN` | Client (build-time, public) | Browser error capture. Same DSN value; DSNs are not secrets |
| `SENTRY_AUTH_TOKEN` | **Build only** | Enables source-map upload. Omit and you still get errors, just minified stack traces |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Build only | Org + project slugs for the source-map plugin |

### Optional / future

| Variable | Purpose |
|---|---|
| Email service credentials | Out-of-app notifications (not yet wired up) |

### Secret management
Use the hosting platform's secrets manager (Vercel Environment Variables,
AWS Secrets Manager, etc.). Do **not** check secrets into the repo or pass
them through CI logs.

---

## 8. Daily reminder cron

### What it does
Once per day, scans for CVRs / FCOs / RFIs awaiting approval, past their
due date, or stuck in a workflow state, and dispatches in-app notifications
to the relevant approvers / originators. Implementation:
[cron.ts](../src/server/cron.ts) + [reminders.ts](../src/utils/reminders.ts).

### Current behavior
The cron is registered in-process via `node-cron`. On serverless (Vercel),
this only fires when a function is warm — **not reliable for daily
delivery in production**.

### What IT needs to set up
Pick one:

- **Vercel Cron Job** (easiest if staying on Vercel) hitting a server-fn
  endpoint that calls `runScheduledReminders()` once per day
- **Cloudflare Worker scheduled trigger** hitting the same endpoint
- **Always-on worker** running `node-cron` (e.g. small EC2 or Fargate task)

Recommended schedule: once daily, mid-morning user-local time
(e.g. 9 AM ET). The Admin → System page has a "Run reminders now" button
for manual triggering.

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
- All mutations require either project access (`requireProjectAccess`) or
  admin role (`adminHandler`).
- Role hierarchy: USER → APPROVER → ADMINISTRATOR.

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
10. **Set up the daily cron** (§8) and uptime monitoring (§9).
11. **Smoke-test:** create a CVR, transition it through the workflow,
    upload an attachment, run the global search.

---

## 12. Open items / future work

The following are not blockers for v1 production but should be tracked:

- **Error tracking integration** (Sentry or equivalent)
- **Healthcheck endpoint** for uptime monitoring
- **Email / Slack notification delivery** — currently in-app inbox only
- **Server-side PDF generation** for CVR / FCO / RFI print packets
  (currently relies on the browser print dialog)
- **Retention policy** for closed projects (if contractually required)
- **Procurement (purchase orders, vendor management)** — the "P" in EPC
  is largely absent; would be its own module
- **Original owner-contract value & billing milestones** — PCOs handle
  change-side commerce but not the prime contract base

---

*Document last updated: 2026-06-05.*
