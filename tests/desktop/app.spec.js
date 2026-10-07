import { _electron as electron, test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("desktop assets, layout, local inference, and persistence work without a web server", async () => {
  const packaged = process.env.WORDBRIDGE_EXECUTABLE;
  const profile = await mkdtemp(path.join(os.tmpdir(), "wordbridge-desktop-test-"));
  const application = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args: [...(packaged ? [] : ["."]), `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }
  });
  try {
    const page = await application.firstWindow();
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on("request", (request) => {
      if (!/^(app:|data:|blob:)/.test(request.url())) external.push(request.url());
    });
    await expect(page.locator("#engine-status")).toContainText("2,500 words");
    expect(page.url()).toBe("app://-/index.html");
    const layout = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector(".site-header")).display,
      grid: getComputedStyle(document.querySelector(".word-grid")).display,
      background: getComputedStyle(document.body).backgroundColor,
      stylesheets: document.styleSheets.length
    }));
    expect(layout.header).toBe("flex");
    expect(layout.grid).toBe("grid");
    expect(layout.stylesheets).toBeGreaterThan(0);
    await expect(page.locator("#word-grid .word-card")).toHaveCount(24);
    await page.locator("#semantic-button").click();
    await expect(page.locator("#engine-status")).toContainText("semantic search ready", { timeout: 30000 });
    await page.locator("#clue-input").fill("round thing i use to eat soup");
    await page.locator("#search-form [type='submit']").click();
    await expect(page.locator("#word-grid")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("#word-grid")).toContainText("Bowl");
    await expect(page.locator("#word-grid")).toContainText("Spoon");
    await expect(page.locator("#word-grid")).not.toContainText("Apple");
    await expect(page.locator("#clarification")).toBeVisible();
    const before = await page.locator("#text-size-toggle").getAttribute("aria-pressed");
    await page.locator("#text-size-toggle").click();
    await page.reload();
    await expect(page.locator("#engine-status")).toContainText("2,500 words");
    await expect(page.locator("#text-size-toggle")).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    await page.locator("#text-size-toggle").click();
    await page.screenshot({ path: test.info().outputPath("desktop.png"), fullPage: true });
    const window = await application.browserWindow(page);
    await window.evaluate((win) => win.setSize(600, 700));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await window.evaluate((win) => win.setSize(390, 600));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("#storage-status")).toBeEmpty();
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  } finally {
    await application.close();
    await rm(profile, { recursive: true, force: true });
  }
});
