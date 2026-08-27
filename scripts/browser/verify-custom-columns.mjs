import { openApp } from "./session.mjs";

/**
 * Drives the custom take-off columns end to end, through the UI, and captures
 * each step.
 *
 * Adds columns the way an estimator would rather than inserting definitions in
 * the database — the point is to exercise the add flow, not just the render.
 */

const ADD_BUTTON = '[title="Add or manage custom columns for this sheet"]';
const NAME_INPUT = 'input[placeholder="Column name"]';

const app = await openApp();
const { page, shot, goto, consoleErrors } = app;

try {
  await goto("piping");

  const addColumn = async (label) => {
    await page.locator(ADD_BUTTON).first().click();
    await page.locator(NAME_INPUT).fill(label);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // The mutation invalidates the definitions and the sheets; give both time.
    await page.waitForTimeout(1800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    console.log(`  added "${label}"`);
  };

  console.log("1. adding two columns through the popover");
  await addColumn("Client Tag");
  await addColumn("Heat Number");

  console.log("2. popover with both columns listed");
  await page.locator(ADD_BUTTON).first().click();
  await page.waitForTimeout(600);
  await shot("cc-1-popover-with-columns");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("3. the sheet, scrolled right to the new columns");
  // The grid is its own scroll pane; scroll it rather than the page.
  const grid = page.locator("div.overflow-auto").first();
  await grid.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.waitForTimeout(600);
  await shot("cc-2-columns-on-sheet");

  console.log("4. typing into a custom cell");
  const cells = page.locator('td[data-col] input[type="text"]');
  const count = await cells.count();
  if (count > 0) {
    await cells.last().fill("CT-4471");
    await page.waitForTimeout(400);
    await shot("cc-3-value-typed");
  } else {
    console.log("  (no editable cell found at this scroll position)");
  }

  console.log("5. scrolled down — does the header stick?");
  await grid.evaluate((el) => {
    el.scrollTop = 400;
  });
  await page.waitForTimeout(600);
  await shot("cc-4-sticky-header");

  console.log(
    consoleErrors.length
      ? `\nConsole errors (${consoleErrors.length}):\n  ${consoleErrors.slice(0, 8).join("\n  ")}`
      : "\nNo console errors.",
  );
} finally {
  await app.close();
}
