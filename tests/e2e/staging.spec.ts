import { expect, test } from "@playwright/test";

test("loads the explorer, WebGL scene, and live APIs without client errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));

  // The explorer intentionally polls forever, so networkidle is not a valid
  // readiness signal. Assert the user-visible application state instead.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/GenScope/i);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByPlaceholder(/Search block/i)).toBeVisible();
  await expect(page.getByText(/LIVE|SYNCING|RECONNECTING/).first()).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) <= 768) {
    // Mobile intentionally replaces the permanent desktop sidebar with a
    // compact trigger; its count and transaction content live in the drawer.
    const feedTrigger = page.getByRole("button", { name: /Feed/ });
    await expect(feedTrigger).toBeVisible();
    await feedTrigger.click();
    const feed = page.getByLabel("Live transaction feed");
    await expect(feed).toBeVisible();
    await expect(feed.getByText(/^\d+ txs$/)).toBeVisible({ timeout: 45_000 });
    await feed.getByRole("button", { name: "Close live feed" }).click();
    await expect(feed).not.toBeVisible();
  } else {
    await expect(page.getByText(/^\d+ txs$/)).toBeVisible({ timeout: 45_000 });
  }

  const firstPartyFailures = failedRequests.filter((url) => url.includes(new URL(page.url()).host));
  expect(firstPartyFailures).toEqual([]);
  expect(consoleErrors.filter((entry) => !entry.includes("THREE.WebGLRenderer"))).toEqual([]);
});

test("searches a current block and opens its result", async ({ page, request }) => {
  test.setTimeout(150_000);
  const rpc = await request.post("/api/rpc", {
    data: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
  });
  expect(rpc.ok()).toBeTruthy();
  const { result } = await rpc.json();
  const blockNumber = Number.parseInt(result, 16);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const input = page.getByPlaceholder(/Search block/i);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(input).toBeEditable();
  await input.fill(String(blockNumber));
  await expect(input).toHaveValue(String(blockNumber));
  await page.getByRole("button", { name: "GO" }).click();
  const resultRow = page.getByText(`Block #${blockNumber.toLocaleString()}`);
  await expect(resultRow).toBeVisible();
  await resultRow.click();
  // The details overlay intentionally repeats the block label, so asserting
  // that label is hidden produces a false timeout after successful navigation.
  await expect(input).toHaveValue("");
  await expect(page.getByRole("button", { name: /Close/i })).toBeVisible();
});

test("rejects malformed and state-changing RPC calls", async ({ request }) => {
  const forbidden = await request.post("/api/rpc", {
    data: { jsonrpc: "2.0", id: 2, method: "eth_sendRawTransaction", params: ["0x00"] },
  });
  expect(forbidden.status()).toBe(403);
  expect(await forbidden.json()).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });

  const malformed = await request.fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    data: Buffer.from("{invalid"),
  });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
});
