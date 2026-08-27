import "dotenv/config";
import { chromium } from "playwright-core";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Screenshots an authenticated page of the running dev server.
 *
 *   node scripts/browser/shot.mjs /piping piping-grid [--width 1600] [--height 1000]
 *
 * Drives the Chrome already installed on this machine (`channel: "chrome"`), so
 * `playwright-core` is the only dependency — no bundled browser download.
 *
 * Auth goes through `@clerk/testing`: `clerkSetup` mints a testing token from
 * `CLERK_SECRET_KEY`, `setupClerkTestingToken` stops Clerk's bot detection from
 * blocking an automated browser, and `clerk.signIn` signs in as the dedicated
 * test account without touching the sign-in UI. Nothing here depends on a
 * human logging in first.
 */

const [, , rawPath = "/", rawName = "shot", ...rest] = process.argv;

/**
 * Normalize the route argument.
 *
 * Git Bash (MSYS) rewrites an argument that starts with "/" into a Windows
 * path, so `shot.mjs /piping` arrives as "C:/Program Files/Git/piping".
 * Accept that, a bare "piping", or a proper "/piping" and produce the same
 * route either way.
 */
const routeOf = (raw) => {
  const mangled = raw.match(/[/\\]Git[/\\](.*)$/i);
  const cleaned = mangled ? mangled[1] : raw;
  return "/" + cleaned.replace(/^\/+/, "");
};
const route = routeOf(rawPath);
const arg = (flag, fallback) => {
  const i = rest.indexOf(flag);
  return i === -1 ? fallback : Number(rest[i + 1]);
};
const width = arg("--width", 1600);
const height = arg("--height", 1000);

/** Repeatable `--click <selector>`, applied in order before the shot. */
const clicks = rest.reduce(
  (acc, v, i) => (rest[i - 1] === "--click" ? [...acc, v] : acc),
  [],
);
/** `--scroll <selector> <px>` scrolls an element before the shot. */
const scrollIdx = rest.indexOf("--scroll");
const scroll =
  scrollIdx === -1
    ? null
    : { selector: rest[scrollIdx + 1], by: Number(rest[scrollIdx + 2]) };

const BASE = process.env.BROWSER_TEST_BASE_URL ?? "http://localhost:3000";
const email = process.env.BROWSER_TEST_EMAIL;
const password = process.env.BROWSER_TEST_PASSWORD;

if (!email || !password) {
  console.error(
    "BROWSER_TEST_EMAIL / BROWSER_TEST_PASSWORD missing.\n" +
      "Run: node scripts/browser/ensure-test-user.mjs",
  );
  process.exit(1);
}

// Fail fast with a clear message rather than a screenshot of a connection error.
try {
  const res = await fetch(BASE, { redirect: "manual" });
  if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`No dev server at ${BASE} — start it with \`npm run dev\`.`);
  console.error(String(e.message ?? e));
  process.exit(1);
}

await clerkSetup({
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

const outDir = ".screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width, height } });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  await setupClerkTestingToken({ page });
  // Clerk's helper needs to run on a page from the app's own origin.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // `email_code`, not `password`: this Clerk instance offers Google or an
  // email code, with no password field, so the password strategy silently
  // leaves you signed out. The account uses Clerk's `+clerk_test` convention,
  // for which the helper supplies the fixed test code itself.
  await clerk.signIn({ page, signInParams: { strategy: "email_code", identifier: email } });

  // Assert it actually worked. `clerk.signIn` does not throw when the strategy
  // is unavailable — it just leaves the session unset, and the run then
  // screenshots a sign-in page while reporting success. That happened.
  const signedIn = await page.evaluate(() => Boolean(window.Clerk?.user));
  if (!signedIn) {
    throw new Error(
      `Signed out after clerk.signIn as ${email}. Check that the sign-in ` +
        "strategy is enabled on this Clerk instance.",
    );
  }

  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  // The grid renders client-side after its queries settle; networkidle alone
  // can land mid-paint.
  await page.waitForTimeout(1500);

  for (const selector of clicks) {
    await page.locator(selector).first().click();
    await page.waitForTimeout(600);
  }
  if (scroll) {
    await page.locator(scroll.selector).first().evaluate((el, by) => {
      el.scrollTop = by;
      el.scrollLeft = by;
    }, scroll.by);
    await page.waitForTimeout(400);
  }

  const file = join(outDir, `${rawName}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`Saved ${file}`);
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  if (consoleErrors.length) {
    console.log(`\nConsole errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`);
  } else {
    console.log("No console errors.");
  }
} finally {
  await browser.close();
}
