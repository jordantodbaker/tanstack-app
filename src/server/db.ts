import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });

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
