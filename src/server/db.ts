import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const connectionString = `${process.env.DATABASE_URL}`;
// pg.Pool defaults closed idle connections after 10 s, so a user clicking
// around paid a fresh TLS + SCRAM handshake to the Neon pooler (~20–50 ms)
// on most navigations. Keep connections for a couple of minutes instead;
// the pooler is built to hold them. `max` is per server instance — a modest
// cap so a fan-out (the dashboard's summary runs many statements at once)
// doesn't open ten connections per instance on a cold pool.
const adapter = new PrismaPg({
  connectionString,
  max: 8,
  idleTimeoutMillis: 120_000,
  connectionTimeoutMillis: 10_000,
});

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // `query` and `info` add per-statement I/O on every SSR request — drop
    // them. Re-add `"query"` in dev when you need to inspect SQL.
    log: ["warn", "error"],
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Side-effect import: register the daily reminder cron exactly once per
// Node process. Lives next door so any server fn that touches prisma also
// boots the scheduler. `cron.ts` no-ops in non-production and guards
// against duplicate registration via globalThis.
import "./cron";
