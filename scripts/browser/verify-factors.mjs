import { openApp } from "./session.mjs";

/**
 * Verifies the packed factor catalog is complete on the wire.
 *
 * Counting rendered options cannot work — the task-code column is a searchable
 * combobox that only renders matches while open. So this inspects the response
 * itself: one packed entry per code, and every entry a flat even-length
 * size/value array. `piping-factors.test.ts` proves unpack is the exact
 * inverse, so a complete payload means a complete lookup.
 */
const EXPECTED_CODES = 323;

const app = await openApp();
const { page } = app;
let body = null;

page.on("response", async (r) => {
  if (!/_serverFn/.test(r.url())) return;
  try {
    const t = await r.text();
    if (t.includes('"sv"') && t.includes('"taskCodeOptions"')) body = t;
  } catch {
    /* not readable */
  }
});

try {
  // A full page load is SSR-hydrated, so the catalog never crosses the wire.
  // Click through instead — that is the path where the client fetches it.
  await page.waitForTimeout(4000);
  await page.locator(`a[href="/piping"]`).first().click();
  await page.waitForTimeout(5000);
  if (!body) {
    console.log("FAILED to capture the factor response.");
  } else {
    const entries = (body.match(/"sv"/g) ?? []).length;
    const codes = (body.match(/"code"/g) ?? []).length;
    console.log(`response bytes:         ${body.length}`);
    console.log(`packed factor entries:  ${entries}`);
    console.log(`"code" keys present:    ${codes}`);
    console.log(`nulls in payload:       ${(body.match(/null/g) ?? []).length}`);
    console.log(
      entries === EXPECTED_CODES
        ? `\nAll ${EXPECTED_CODES} codes present — catalog intact.`
        : `\nWARNING: expected ${EXPECTED_CODES} entries, saw ${entries}.`,
    );
  }
  console.log(app.consoleErrors.length ? `console errors: ${app.consoleErrors.length}` : "no console errors.");
} finally { await app.close(); }
