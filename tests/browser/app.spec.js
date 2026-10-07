import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function find(page, clue) {
  await page.locator("#clue-input").fill(clue);
  await page.locator("#search-form button[type='submit']").click();
  await expect(page.locator("#word-grid")).toHaveAttribute("aria-busy", "false");
}
async function enableSemantic(page) {
  await page.locator("#semantic-button").click();
  await expect(page.locator("#engine-status")).toContainText("semantic search ready", { timeout: 30000 });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#engine-status")).toContainText("2,500 words");
});
test("basic search fixes the reported failures and pages the bank", async ({ page }) => {
  await expect(page.locator("#word-grid .word-card")).toHaveCount(24);
  await page.locator("#load-more").click();
  await expect(page.locator("#word-grid .word-card")).toHaveCount(48);
  await find(page, "round thing i use to eat soup");
  await expect(page.locator("#word-grid")).toContainText("Bowl");
  await expect(page.locator("#word-grid")).not.toContainText("Apple");
  await find(page, "what I use to call my daughter");
  await expect(page.locator("#word-grid h3").first()).toHaveText("Phone");
});
test("on-device search sends no requests to external services", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5194") && !request.url().startsWith("data:")) external.push(request.url());
  });
  await enableSemantic(page);
  await find(page, "round thing i use to eat soup");
  await expect(page.locator("#word-grid")).not.toContainText("Apple");
  await expect(page.locator("#word-grid")).toContainText("Spoon");
  await expect(page.locator("#word-grid")).toContainText("Bowl");
  await expect(page.locator("#clarification")).toBeVisible();
  await page.locator("#clarification .outline-button").first().click();
  await expect(page.locator("#word-grid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#clarification")).toBeHidden();
  await find(page, "what I use to call my daughter");
  await expect(page.locator("#word-grid h3").first()).toHaveText("Phone");
  expect(external).toEqual([]);
});
test("personal words and saved entries persist and can be updated", async ({ page }) => {
  await page.locator("#add-word-button").click();
  await expect(page.locator("#add-title")).toHaveText("Add a personal word");
  await page.locator("#word-name").fill("Maya test");
  await page.locator("#word-clues").fill("My granddaughter who plays the cello");
  await page.locator("#add-word-form [type='submit']").click();
  await expect(page.locator("#word-grid h3")).toHaveText("Maya test");
  await page.getByRole("button", { name: "Save Maya test", exact: true }).click();
  await page.reload();
  await page.locator('[data-category="Saved"]').click();
  await expect(page.locator("#word-grid h3")).toHaveText("Maya test");
  await enableSemantic(page);
  await page.locator('[data-category="all"]').click();
  await find(page, "granddaughter playing cello");
  await expect(page.locator("#word-grid h3").first()).toHaveText("Maya test");
  await page.getByRole("button", { name: "Choose Maya test" }).click();
  await page.getByRole("button", { name: "Edit Maya test", exact: true }).click();
  await page.locator("#word-name").fill("Maya edited");
  await page.locator("#word-clues").fill("My granddaughter who plays violin");
  await page.locator("#add-word-form [type='submit']").click();
  await expect(page.locator(".selected-word")).toBeHidden();
  await page.locator('[data-category="all"]').click();
  await find(page, "granddaughter playing violin");
  await expect(page.locator("#word-grid h3").first()).toHaveText("Maya edited");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove Maya edited", exact: true }).click();
  await expect(page.locator("#word-grid")).not.toContainText("Maya edited");
  await page.locator('[data-category="Saved"]').click();
  await expect(page.locator("#word-grid .word-card")).toHaveCount(0);
});
test("clear cancels stale results and unknown clues abstain", async ({ page }) => {
  await enableSemantic(page);
  await page.locator("#clue-input").fill("round thing i use to eat soup");
  await page.locator("#search-form [type='submit']").click();
  await page.locator("#clear-button").click();
  await expect(page.locator("#word-grid .word-card")).toHaveCount(24);
  await expect(page.locator("#clarification")).toBeHidden();
  await expect(page.locator("#result-status")).toContainText("words");
  await find(page, "zxqv blorp flarg");
  await expect(page.locator("#word-grid .word-card")).toHaveCount(0);
  await expect(page.locator("#empty-state")).toBeVisible();
});
test("missing model assets surface an error and preserve basic search", async ({ page }) => {
  await page.route("**/data/minilm-manifest.json", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.locator("#semantic-button").click();
  await expect(page.locator("#engine-status")).toContainText("missing");
  await find(page, "tool with prongs to eat food");
  await expect(page.locator("#word-grid h3").first()).toHaveText("Fork");
});
test("filters, preferences, and mobile layout remain usable", async ({ page }) => {
  await page.locator('[data-category="Places"]').click();
  const categories = await page.locator("#word-grid .word-category").allTextContents();
  expect(categories.length).toBeGreaterThan(0);
  expect(categories.every((category) => category === "Places")).toBe(true);
  await page.locator("#text-size-toggle").click();
  await page.locator("#contrast-toggle").click();
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/large-text/);
  await expect(page.locator("body")).toHaveClass(/high-contrast/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Skip to the word finder" }).focus();
  await expect(page.getByRole("link", { name: "Skip to the word finder" })).toBeFocused();
});
test("backup restoration validates data and corrupt storage is not overwritten", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("wordbridge.customWords.v1", '{"broken":true}'));
  await page.reload();
  await expect(page.locator("#storage-status")).toContainText("could not be loaded");
  await page.locator("#add-word-button").click();
  await page.locator("#word-name").fill("Recovery test");
  await page.locator("#word-clues").fill("A test of protecting existing storage");
  await page.locator("#add-word-form [type='submit']").click();
  expect(await page.evaluate(() => localStorage.getItem("wordbridge.customWords.v1"))).toBe('{"broken":true}');
  const backup = {
    version: 1,
    customWords: [{ id: "custom-recovery", label: "Recovered person", category: "People", description: "My cello playing granddaughter", aliases: [], clues: [] }],
    savedIds: ["custom-recovery", "phone"],
    preferences: { largeText: true, highContrast: false }
  };
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restore-input").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator("#storage-status")).toContainText("Backup restored");
  await expect(page.locator("#word-grid h3")).toHaveText("Recovered person");
  await page.locator("#restore-input").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.locator("#storage-status")).toContainText("could not be restored");
  await expect(page.locator("#word-grid h3")).toHaveText("Recovered person");
});
test("the former file address can export its existing saved data for migration", async ({ page }) => {
  await page.goto(new URL("../../index.html", import.meta.url).href);
  await expect(page.locator("#file-migration")).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("wordbridge.savedWords.v1", '["phone","clock"]');
    localStorage.setItem("wordbridge.customWords.v1", "[]");
    localStorage.setItem("wordbridge.preferences.v1", '{"largeText":true,"highContrast":false}');
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#legacy-export").click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.savedIds).toEqual(["phone", "clock"]);
  expect(backup.preferences.largeText).toBe(true);
  expect(backup.version).toBe(1);
});
