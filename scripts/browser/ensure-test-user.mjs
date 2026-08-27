import "dotenv/config";
import { createClerkClient } from "@clerk/backend";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

/**
 * Creates (once) the Clerk account the browser driver signs in as.
 *
 * The address uses Clerk's `+clerk_test` convention, which test instances
 * accept without a real mailbox or a delivered verification code. The account
 * exists only so an automated browser can reach authenticated pages; it is
 * plainly labelled so it is obvious what it is in the Clerk dashboard, and
 * deleting it there is the whole cleanup.
 *
 * The generated password is written to `.env` (gitignored) rather than printed,
 * so it does not end up in a terminal transcript.
 *
 * Idempotent: re-running finds the existing account and leaves it alone.
 */

const EMAIL = "epcmngr.browser.agent+clerk_test@example.com";
const ENV_PATH = ".env";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error("CLERK_SECRET_KEY is not set — cannot manage the test user.");
  process.exit(1);
}

const clerk = createClerkClient({ secretKey });

const existing = await clerk.users.getUserList({ emailAddress: [EMAIL] });
if (existing.totalCount > 0) {
  const user = existing.data[0];
  console.log(`Test user already exists: ${EMAIL} (${user.id})`);
  const env = readFileSync(ENV_PATH, "utf8");
  if (!env.includes("BROWSER_TEST_PASSWORD=")) {
    console.warn(
      "But BROWSER_TEST_PASSWORD is missing from .env — delete the user in the\n" +
        "Clerk dashboard and re-run this to mint a fresh one.",
    );
    process.exit(1);
  }
  process.exit(0);
}

// 24 random bytes, base64url — comfortably past any password policy.
const password = randomBytes(24).toString("base64url");

const user = await clerk.users.createUser({
  emailAddress: [EMAIL],
  password,
  firstName: "Browser",
  lastName: "Agent (automated)",
  skipPasswordChecks: true,
});

appendFileSync(
  ENV_PATH,
  `\n# Account the browser driver signs in as. Created by\n` +
    `# scripts/browser/ensure-test-user.mjs; delete the user in the Clerk\n` +
    `# dashboard to revoke it.\n` +
    `BROWSER_TEST_EMAIL=${EMAIL}\n` +
    `BROWSER_TEST_PASSWORD=${password}\n`,
);

console.log(`Created test user ${EMAIL} (${user.id}).`);
console.log("Credentials appended to .env (gitignored).");
