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
  await expect(page.getByText(/^[1-9]\d* txs$/)).toBeVisible({ timeout: 45_000 });

  const firstPartyFailures = failedRequests.filter((url) => url.includes(new URL(page.url()).host));
  expect(firstPartyFailures).toEqual([]);
  expect(consoleErrors.filter((entry) => !entry.includes("THREE.WebGLRenderer"))).toEqual([]);
});

test("searches a current block and opens its result", async ({ page, request }) => {
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
  await expect(resultRow).toBeHidden();
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
