import { openApp } from "./session.mjs";

/**
 * The property this whole design rests on: a row whose only content is a
 * custom column must survive the autosave.
 *
 * Types a value into a custom cell, waits past the save debounce, reloads, and
 * reads the cell back from a fresh page load.
 */
const app = await openApp();
const { page, shot, goto, consoleErrors } = app;

try {
  await goto("piping");
  const grid = page.locator("div.overflow-auto").first();
  await grid.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForTimeout(500);

  // Last data cell on the first row = the right-most custom column.
  const cell = page.locator("tbody tr").first().locator("td input").last();
  await cell.click();
  await cell.fill("CT-4471");
  await cell.press("Tab");
  console.log("typed CT-4471 into the last custom cell of row 1");

  // Autosave is debounced (500ms) plus a round-trip.
  await page.waitForTimeout(3000);
  await shot("persist-1-typed");

  console.log("reloading…");
  await goto("piping");
  await grid.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForTimeout(800);

  const after = await page
    .locator("tbody tr").first().locator("td input").last().inputValue();
  console.log(`after reload, the cell reads: ${JSON.stringify(after)}`);
  console.log(after === "CT-4471" ? "PERSISTED ✓" : "NOT PERSISTED ✗");
  await shot("persist-2-after-reload");

  console.log(consoleErrors.length ? `console errors: ${consoleErrors.length}` : "No console errors.");
} finally {
  await app.close();
}
