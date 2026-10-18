import { describe, expect, it } from "vitest";
import { collectFeedBackfill, type ExplorerTx } from "../app/hooks/useLiveFeed";

function item(index: number): ExplorerTx {
  return {
    hash: `eth-${index}`,
    data: "0x",
    blockNumber: index,
    receivedAt: "",
    from: "0xfrom",
    to: "0xto",
  };
}

describe("live-feed backfill", () => {
  it("recovers a burst larger than the 20-item first page up to the prior watermark", async () => {
    const newestFirst = Array.from({ length: 46 }, (_, index) => item(45 - index));
    const pages = [newestFirst.slice(0, 20), newestFirst.slice(20, 40), newestFirst.slice(40)];
    const result = await collectFeedBackfill(
      async (page) => pages[page - 1] ?? [],
      "eth-0",
    );

    expect(result.watermarkFound).toBe(true);
    expect(result.newestHash).toBe("eth-45");
    expect(result.items).toHaveLength(45);
    expect(result.items.at(-1)?.hash).toBe("eth-1");
  });

  it("reports bounded partial coverage when the watermark is beyond the page budget", async () => {
    const result = await collectFeedBackfill(
      async (page) => Array.from({ length: 20 }, (_, index) => item(page * 100 + index)),
      "not-in-window",
      2,
    );
    expect(result.watermarkFound).toBe(false);
    expect(result.items).toHaveLength(40);
  });
});
