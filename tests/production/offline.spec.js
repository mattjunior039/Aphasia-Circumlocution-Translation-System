import { test, expect } from "@playwright/test";

test.describe("without offline caching", () => {
  test.use({ serviceWorkers: "block" });
  test("production local inference also works without a service worker", async ({ page }) => {
    await page.goto("/");
    await page.locator("#semantic-button").click();
    await expect(page.locator("#engine-status")).toContainText("semantic search ready", { timeout: 10000 });
  });
});

test("the production shell and local inference survive offline reload", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();
  await page.locator("#semantic-button").click();
  await expect(page.locator("#engine-status")).toContainText("semantic search ready", { timeout: 30000 });
  await page.locator("#clue-input").fill("round thing i use to eat soup");
  await page.locator("#search-form [type='submit']").click();
  await expect(page.locator("#word-grid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#word-grid")).toContainText("Spoon");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#engine-status")).toContainText("2,500 words");
  await page.locator("#semantic-button").click();
  await expect(page.locator("#engine-status")).toContainText("semantic search ready", { timeout: 30000 });
  await page.locator("#clue-input").fill("what I use to call my daughter");
  await page.locator("#search-form [type='submit']").click();
  await expect(page.locator("#word-grid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#word-grid h3").first()).toHaveText("Phone");
});
