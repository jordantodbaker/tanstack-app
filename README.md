# EPC Manager

Internal project-controls platform for an EPC (Engineering, Procurement,
Construction) contractor. It covers estimating, change management, the cost
code structure, and cost reporting against an estimate baseline.

The user-facing guide is [docs/user-guide.md](docs/user-guide.md); the same
content is in the app behind the **?** button in the header. This file is for
whoever has to run or change the code.

## The five apps

Navigation is split by working area, registered in
[src/config/apps.ts](src/config/apps.ts). `appForPath` resolves the current
route to its app, and the shell renders only that app's sidebar and header
nav. `/` is a launcher with one card per app.

| App | What it covers |
|---|---|
| **Field Estimate Form** | Per-discipline take-off sheets, crews and rates, then Summary / Basis / Validation. The only app with the discipline tree and the version picker. |
| **Change Log** | Trends → PCOs → RFIs → Field Change Orders, with approval workflow, templates and print views. |
| **Cost Breakdown Structure** | A project's cost code list, and the whole CBS Code Book. Excel export of either. |
| **Reporting** | Dashboard, cost periods, EVM, CVR templates. |
| **Administration** | Projects, areas, subcontractors, labour rates, crew mixes, users, system settings. |

An app is a grouping of existing routes, **not** a URL prefix — the paths are
unchanged, which is why the emailed "Open in app" links in
[src/lib/entity-routes.ts](src/lib/entity-routes.ts) keep working.

## Getting started

Node 22.x and **npm** (the lockfile is `package-lock.json`; there is no
`engines` pin or `.nvmrc`).

```sh
npm install          # postinstall runs `prisma generate`
npm run dev          # http://localhost:3000
```

You need a `.env` before `dev` will get past the first query. It is gitignored;
ask whoever set the project up for the values.

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Postgres (pooled connection string) |
| `CLERK_SECRET_KEY` | Server-side auth |
| `VITE_CLERK_PUBLISHABLE_KEY` | Client-side auth (build-time, baked into the bundle) |
| `BLOB_READ_WRITE_TOKEN` | File attachments — read implicitly by `@vercel/blob` |

Optional, each a no-op when unset: `SENTRY_DSN` / `VITE_SENTRY_DSN` (error
tracking), `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (source-map
upload at build time only), `RESEND_API_KEY` + `EMAIL_FROM` (outbound
notification email), `APP_BASE_URL` (absolute links in those emails),
`CRON_SECRET` (guards the reminder cron route), `TEST_DATABASE_URL` (the
integration suite). Full detail in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §7.

## Check which database you are pointed at

`.env` has carried more than one `DATABASE_URL`, with the inactive one
commented out. They are different databases and the comment does not say
which is which. Anything that writes schema or bulk data takes its connection
from whichever line is live:

```
prisma db push      prisma db seed      npm run cbs:import
npm run cbs:rename  npm run piping:sync-codes
```

Read the live `DATABASE_URL` before running any of them. Every script supports
`-- --dry-run`; use it first. `npm run seed-test` wipes and reseeds — never
point it anywhere real.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build, then `tsc --noEmit` |
| `npm test` | Unit + component suite (no database) |
| `npm run test:integration` | DB-backed suite — see [docs/integration-testing.md](docs/integration-testing.md) |
| `npm run check:client-leak` | Fails if a client-reachable module pulls in Prisma. Run it in CI. |
| `npm run cbs:import` | Re-import `prisma/data/CBS.xlsx` into `CbsItem` |
| `npm run cbs:rename` | Re-apply account renames the workbook doesn't carry yet |
| `npm run piping:sync-codes` | Push piping metallurgy codes into `PipingGroup` |
| `npm run seed-test` | Full demo dataset (destructive) |

The CBS scripts run **in a specific order** after a new workbook lands; that
sequence, and the hard-coded tables a CBS renumbering invalidates, are in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §11a and
[scripts/README.md](scripts/README.md).

## Layout

```
src/routes/       File-based routes. `x.tsx` holds the route + loader;
                  `x.lazy.tsx` holds the component, so it ships as its own
                  chunk. Not every route is split yet.
src/utils/        Server functions (`createServerFn`) and their query options.
                  `*.server.ts` is server-only and never enters the client graph.
src/lib/          Pure logic — no Prisma, no React Query. Most of the test suite
                  lives against this layer.
src/components/   UI. Per-domain folders (Cbs/, Changelog/, Piping/, …) plus
                  shared primitives in ui/.
src/config/       Data that drives the UI: the app registry, disciplines, CBS
                  level colours, the in-app help guide.
prisma/           Schema, seeds, and the CBS workbook loader + `data/CBS.xlsx`.
scripts/          Maintenance jobs run against a database directly.
```

## Conventions worth knowing before you change things

- **Every server function is wrapped in a guard** from
  [src/utils/users.server.ts](src/utils/users.server.ts) —
  `projectScopedHandler` / `projectIdScopedHandler`, `versionScopedHandler`,
  `requireRecordAccess`, or `adminHandler` / `adminHandlerNoInput`. The gate is
  structural so it can't be forgotten; don't write a handler without one.
- **`prisma db push`, no migration history.** There is no `prisma/migrations`
  directory. Schema changes are pushed; review the diff Prisma prints.
- **Inputs are validated at the boundary** with the Zod schemas in
  [src/lib/validators.ts](src/lib/validators.ts).
- **The client bundle is watched.** `npm run check:client-leak` runs Vite's
  client transform over every first-party module and fails if one reaches
  Prisma. It catches things `tsc` and the production build miss.
- **Unit tests default to the Node environment.** A component test opts into a
  DOM with `// @vitest-environment happy-dom` at the top of the file.

## Further reading

| Document | For |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production brief: hosting, database, storage, auth, env vars, cron, security, first-deploy runbook, CBS update runbook |
| [docs/STAGING_AND_PRODUCTION_DEPLOY.md](docs/STAGING_AND_PRODUCTION_DEPLOY.md) | The two-environment setup and what is set where |
| [docs/user-guide.md](docs/user-guide.md) | End-user guide (also in-app) |
| [docs/integration-testing.md](docs/integration-testing.md) | Running the DB-backed suite |
| [docs/LIVING_BUDGET_PLAN.md](docs/LIVING_BUDGET_PLAN.md) | Design notes for the living-budget / CVR reconciliation work |
| [scripts/README.md](scripts/README.md) | What each maintenance script does |

## Stack

TanStack Start (React 19, server functions) · Prisma 7 + PostgreSQL · Clerk ·
Vercel Blob · Resend · Sentry · exceljs · Vitest. Deployed as a serverless
Node bundle on Vercel.
