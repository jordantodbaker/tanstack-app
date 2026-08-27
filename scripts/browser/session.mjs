import "dotenv/config";
import { chromium } from "playwright-core";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared browser session for the driver scripts.
 *
 * Drives the Chrome already installed on this machine, so `playwright-core` is
 * the only dependency — no bundled browser download.
 */

export const BASE = process.env.BROWSER_TEST_BASE_URL ?? "http://localhost:3000";
export const OUT_DIR = ".screenshots";

/**
 * Route argument normalization.
 *
 * Git Bash (MSYS) rewrites an argument starting with "/" into a Windows path,
 * so `shot.mjs /piping` arrives as "C:/Program Files/Git/piping". Accept that,
 * a bare "piping", or a proper "/piping" and produce the same route.
 */
export function routeOf(raw) {
  const mangled = raw.match(/[/\\]Git[/\\](.*)$/i);
  const cleaned = mangled ? mangled[1] : raw;
  return "/" + cleaned.replace(/^\/+/, "");
}

/**
 * Launches a browser already signed in as the test account.
 *
 * Returns the page plus a live `consoleErrors` array and a `shot()` helper.
 * Callers must `await close()`.
 */
export async function openApp({ width = 1600, height = 1000 } = {}) {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) {
    throw new Error(
      "BROWSER_TEST_EMAIL missing — run scripts/browser/ensure-test-user.mjs",
    );
  }

  // Fail with a clear message rather than a screenshot of a connection error.
  try {
    await fetch(BASE, { redirect: "manual" });
  } catch (e) {
    throw new Error(
      `No dev server at ${BASE} — start it with \`npm run dev\`. (${e.message})`,
    );
  }

  await clerkSetup({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await setupClerkTestingToken({ page });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  // `email_code`, not `password`: this Clerk instance offers Google or an email
  // code and has no password field, so the password strategy silently leaves
  // you signed out. The account uses Clerk's `+clerk_test` convention, for
  // which the helper supplies the fixed test code itself.
  await clerk.signIn({
    page,
    signInParams: { strategy: "email_code", identifier: email },
  });

  // Assert it worked. `clerk.signIn` does NOT throw when the strategy is
  // unavailable — it leaves the session unset and the run then screenshots a
  // sign-in page while reporting success. That happened; hence this check.
  if (!(await page.evaluate(() => Boolean(window.Clerk?.user)))) {
    await browser.close();
    throw new Error(
      `Signed out after clerk.signIn as ${email}. Is the sign-in strategy enabled?`,
    );
  }

  const shot = async (name) => {
    const file = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`  saved ${file}`);
    return file;
  };

  /** Navigate and let the grid's client-side queries settle. */
  const goto = async (route) => {
    await page.goto(`${BASE}${routeOf(route)}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
  };

  return { browser, page, consoleErrors, shot, goto, close: () => browser.close() };
}
