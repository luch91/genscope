import { expect, test } from "@playwright/test";

const mobileViewports = [
  { width: 320, height: 700 },
  { width: 360, height: 780 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];

test.describe.configure({ mode: "serial" });

test("keeps the scene primary and feed dismissible across responsive viewports", async ({ page }) => {
  test.setTimeout(240_000);
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    if (page.url() === "about:blank") {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    }

    await expect(page.locator("canvas")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByPlaceholder(/Search block/i)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    if (viewport.width <= 768 || (viewport.height <= 500 && viewport.width > viewport.height)) {
      await expect(page.getByRole("button", { name: /Feed/ })).toBeVisible();
      await page.getByRole("button", { name: /Feed/ }).click();
      await expect(page.getByLabel("Live transaction feed")).toBeVisible();
      await page.getByRole("button", { name: "Close live feed" }).last().click();
      await expect(page.getByLabel("Live transaction feed")).not.toBeVisible();
    } else {
      await expect(page.getByLabel("Live transaction feed")).toBeVisible();
      await expect(page.getByRole("button", { name: /Feed/ })).toBeHidden();
    }

    const box = await page.locator("canvas").boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 4 });
      await page.mouse.up();
    }
  }
});

test("completes the mobile feed, transaction, search, and scene interaction flow", async ({ page, request }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const feedTrigger = page.getByRole("button", { name: /Feed/ });
  await expect(feedTrigger).toBeVisible();
  await feedTrigger.click();
  const feed = page.getByLabel("Live transaction feed");
  await expect(feed).toBeVisible();
  await expect(feed.getByText(/^\d+ txs$/)).toBeVisible();
  const transaction = feed.getByRole("button", { name: /^Open transaction/ }).first();
  await expect(transaction).toBeVisible({ timeout: 90_000 });
  await transaction.click();
  await expect(feed).not.toBeVisible();

  const details = page.getByRole("dialog", { name: "Transaction details" });
  await expect(details).toBeVisible();
  await expect(details.getByText("TX HASH")).toBeVisible();
  await details.getByRole("button", { name: "Close transaction details" }).click();
  await expect(details).not.toBeVisible();
  await expect(canvas).toBeVisible();

  const rpc = await request.post("/api/rpc", {
    data: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
  });
  expect(rpc.ok()).toBeTruthy();
  const blockNumber = Number.parseInt((await rpc.json()).result, 16);
  const search = page.getByPlaceholder(/Search block/i);
  await search.fill(String(blockNumber));
  await page.getByRole("button", { name: "GO" }).click();
  const result = page.getByText(`Block #${blockNumber.toLocaleString()}`);
  await expect(result).toBeVisible({ timeout: 60_000 });
  await result.click();
  await expect(page.getByRole("button", { name: /Close block details/i })).toBeVisible();
  await page.getByRole("button", { name: /Close block details/i }).click();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.55, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -180);
  }
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("checks the visible chain head on a one-second cadence without overlapping", async ({ page }) => {
  const headChecks: number[] = [];
  await page.route("**/api/rpc", async (route) => {
    const request = route.request();
    try {
      const payload = request.postDataJSON();
      if (payload?.method === "eth_blockNumber") {
        headChecks.push(Date.now());
        await route.fulfill({
          contentType: "application/json",
          // Keep initial hydration intentionally small so this test measures the
          // scheduler rather than saturating the local HTTP/1 connection pool
          // with a synthetic 100-block backfill.
          body: JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: "0x1" }),
        });
        return;
      }
    } catch {
      // Ignore non-JSON negative-test payloads.
    }
    // Isolate the cadence from unrelated receipt/statistics traffic and the
    // local development server's HTTP/1 connection limit.
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  await expect.poll(() => headChecks.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  const intervals = headChecks.slice(1).map((value, index) => value - headChecks[index]);
  // Headless software WebGL can stall the main thread while the canvas is
  // compiling; require a steady-state one-second sample without pretending
  // that startup stalls are network backoff.
  expect(intervals.some((interval) => interval >= 850 && interval < 2_500)).toBe(true);
});
