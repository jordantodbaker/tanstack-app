# Staging & Production Deployment Steps

A concrete, step-by-step runbook for deploying EPC Manager to **staging** and
**production** on Vercel. For the broader IT handoff brief (what each component
is and how to provision it), see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Stack (what we're deploying)

| Layer | Tech | Deploy implication |
|---|---|---|
| App | [TanStack Start](../vite.config.ts) (React 19 + Vite 8, SSR) | Custom Vercel adapter at [api/handler.js](../api/handler.js); not a zero-config framework preset |
| Host | Vercel serverless | [vercel.json](../vercel.json) rewrites everything to `/api/handler`, except `/api/healthcheck` |
| DB | PostgreSQL on Neon + Prisma 7 (`@prisma/adapter-pg`) | [src/server/db.ts](../src/server/db.ts); needs `DATABASE_URL` |
| Auth | Clerk | `VITE_CLERK_PUBLISHABLE_KEY` (build-time) + `CLERK_SECRET_KEY` |
| Errors | Sentry | Runtime DSN + build-time source-map upload token |
| Files | Vercel Blob | `BLOB_READ_WRITE_TOKEN` |
| Jobs | in-process `node-cron` | ⚠️ won't run reliably on serverless — see Step 6 |

---

## Two things that will block / bite you (read first)

1. **There are no Prisma migrations.** [prisma/](../prisma/) has `schema.prisma`
   but no `migrations/` folder, and the build (`vite build && tsc --noEmit`)
   never runs `prisma migrate deploy`. Nothing currently applies the schema to a
   remote DB. Add a migration baseline and a deploy step before staging works
   (Step 2 + Step 5).

2. **`node-cron` in [src/server/cron.ts](../src/server/cron.ts) is effectively
   dead on Vercel.** Serverless functions don't stay resident, so a `0 7 * * *`
   in-process schedule will almost never fire. Move it to Vercel Cron (Step 6).

---

## The environment model

Vercel gives three scopes per project: **Production**, **Preview**,
**Development**. Recommended mapping:

- **Production** = `main` branch → prod domain.
- **Staging** = a long-lived `staging` branch. Its Preview deployments get a
  stable alias (e.g. `staging.yourapp.com`). Env vars scoped to "Preview"
  (optionally pinned to the `staging` branch).

One Vercel project, one codebase, two databases / auth instances.
(Alternative: two separate Vercel projects for hard isolation — more overhead,
only if you need fully separate billing/access.)

---

## Step 1 — Provision per-environment backing services

Create **separate** instances so staging can't touch prod data:

- **Neon**: a `staging` branch (or separate DB) and a `production` branch. Grab
  each pooled connection string.
- **Clerk**: separate Development and Production instances (distinct
  publishable/secret keys; prod requires a verified domain).
- **Sentry**: one project with two `environment` tags (`staging`,
  `production`), or two projects. Create a build auth token.
- **Vercel Blob**: two stores (staging/prod), or accept Vercel auto-provisioning
  `BLOB_READ_WRITE_TOKEN` per environment when you connect a store.

## Step 2 — Establish a Prisma migration baseline (one-time, local)

```bash
# Point at an EMPTY staging DB, generate the first migration from your schema
prisma migrate dev --name init
# This creates prisma/migrations/<timestamp>_init/ — commit it.
git add prisma/migrations && git commit -m "Add initial Prisma migration"
```

The schema uses the `pg_trgm` extension. Confirm the generated migration emits
`CREATE EXTENSION "pg_trgm"` (Neon allows it) and includes the trigram GIN
indexes.

## Step 3 — Configure env vars in Vercel

Set these in **Vercel → Project → Settings → Environment Variables**, scoping
each to Production vs Preview:

| Variable | Scope | Notes |
|---|---|---|
| `DATABASE_URL` | Prod + Preview (different values) | Neon pooled string |
| `VITE_CLERK_PUBLISHABLE_KEY` | Prod + Preview | build-time, baked into client bundle |
| `CLERK_SECRET_KEY` | Prod + Preview | server only |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Prod + Preview | server + client DSN |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Prod (Preview optional) | build-time source-map upload (gated in [vite.config.ts](../vite.config.ts)) |
| `BLOB_READ_WRITE_TOKEN` | Prod + Preview | auto-set if you connect a Blob store |
| `RESEND_API_KEY` | Prod + Preview | enables outbound notification email; unset = email disabled (in-app only) |
| `EMAIL_FROM` | Prod + Preview | verified sender, e.g. `EPC Manager <notify@yourco.com>` — required to send |
| `EMAIL_REPLY_TO` | optional | Reply-To header on notification emails |
| `APP_BASE_URL` | Prod + Preview | public URL (e.g. `https://app.yourco.com`) for "open in app" links in emails |
| `CRON_SECRET` | Prod (+ any env running the cron) | guards `/api/cron/reminders`; Vercel injects it as the cron's `Authorization` header (see Step 6) |

Email is fully gated on `RESEND_API_KEY` + `EMAIL_FROM`: with either unset, the
app sends no email and only writes the in-app inbox (no errors). Verify a
sending domain in Resend before setting these, and use a different `APP_BASE_URL`
per environment so staging emails don't link to prod.

`NODE_ENV=production` is set automatically by Vercel for both prod and preview
builds — note the cron guard keys off this.

## Step 4 — Wire up the Vercel project

```bash
npm i -g vercel
vercel link            # link this repo to the project
```

Confirm settings match [vercel.json](../vercel.json): Build Command
`npm run build`, Output `dist/client`. Framework preset = "Other" (the custom
handler means you don't want a preset overriding routing).

## Step 5 — Add migration deploy to the pipeline

Don't run `migrate deploy` inside the Vercel build (build env shouldn't hold
write-DDL creds, and a failed migration mid-build is messy). Pick one:

- **Recommended**: run `prisma migrate deploy` as a deploy gate in CI (GitHub
  Action) against the target DB *before* promoting, or manually:
  ```bash
  DATABASE_URL=<staging-url> prisma migrate deploy   # before staging deploy
  DATABASE_URL=<prod-url>    prisma migrate deploy   # before prod deploy
  ```
- Keep `prisma generate` where it is (`postinstall`) — that's correct and must
  stay.

## Step 6 — Daily reminder cron (Vercel Cron) — implemented

The daily reminder pass (and the reminder emails wired into it) runs on
**Vercel Cron**, because the in-process `node-cron` in
[src/server/cron.ts](../src/server/cron.ts) can't fire on serverless (the
instance is frozen between requests). `node-cron` is left in place — harmless
on Vercel, and still works on a long-running/non-serverless host.

Already wired:
- [vercel.json](../vercel.json) `crons`: `{ "path": "/api/cron/reminders", "schedule": "0 14 * * *" }`.
  **Vercel crons run in UTC** — `0 14 * * *` ≈ 07:00 Pacific. Adjust the hour
  for your timezone / DST preference.
- The SSR app route [src/routes/api.cron.reminders.tsx](../src/routes/api.cron.reminders.tsx)
  (reached via the catch-all rewrite) whose loader calls the
  `CRON_SECRET`-guarded `runRemindersCronFn` in
  [src/utils/reminders.ts](../src/utils/reminders.ts).

**You must set `CRON_SECRET`** in Vercel (any environment that should run the
cron). Vercel injects it as an `Authorization: Bearer <CRON_SECRET>` header on
cron invocations; the endpoint rejects anything else with 401. With
`CRON_SECRET` unset the guard is skipped (fine for local/dev). The manual "Run
reminders now" admin button remains as a fallback / on-demand trigger.

Verify after deploy: `curl -i -H "Authorization: Bearer $CRON_SECRET" https://<env-url>/api/cron/reminders`
→ 200; calling it without the header → 401.

## Step 7 — Deploy to staging

```bash
git checkout -b staging && git push -u origin staging
# apply migrations to staging DB first:
DATABASE_URL=<staging-url> prisma migrate deploy
vercel                    # preview deploy, or let the git push trigger it
```

Assign a stable alias: `vercel alias set <deployment-url> staging.yourapp.com`.

## Step 8 — Verify staging

- `GET https://staging.yourapp.com/api/healthcheck` → expect `200` +
  `db.ok: true`.
- Sign in via Clerk, exercise an attachment upload (Blob), and confirm an error
  appears in Sentry's `staging` environment with source-mapped stack traces.

## Step 9 — Promote to production

```bash
# merge staging → main via PR
DATABASE_URL=<prod-url> prisma migrate deploy        # apply migrations to prod first
git checkout main && git merge staging && git push   # triggers prod deploy
```

Or use `vercel promote` to promote the exact staging build artifact.

## Step 10 — Production verification & rollback

- Hit `/api/healthcheck` on prod; smoke-test auth + one write.
- Point an uptime monitor at `/api/healthcheck` (intentionally cheap and
  Prisma-independent).
- **Rollback**: Vercel keeps every deployment immutable —
  `vercel rollback <previous-url>` (or "Promote to Production" on a prior
  deployment in the dashboard) reverts the app instantly. This does **not** roll
  back DB migrations, so keep migrations additive / backward-compatible.
