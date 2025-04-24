import { describe, it, expect } from "vitest";

import { DataLoader } from "../src/DataLoader";

describe("DataLoader batching and cache behavior", () => {
  it("deduplicates requests within a batch, but not across batches", async () => {
    const calls: boolean[][] = [];
    const loader = new DataLoader<{ value: string }>(async (batch) => {
      calls.push(batch.map(([arg]) => arg.value === "hit"));
      for (const [arg, resolve] of batch) {
        resolve(arg.value === "hit");
      }
    });
    const arg = { value: "hit" };
    const arg2 = { value: "miss" };
    // Same arg, same tick
    const p1 = loader.load(arg);
    const p2 = loader.load(arg);
    const p3 = loader.load(arg2);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(false);
    expect(calls.length).toBe(1);
    expect(calls[0]!.length).toBe(2); // arg and arg2
    // Next tick, deduplication resets
    const p4 = loader.load(arg);
    const p5 = loader.load(arg2);
    const [r4, r5] = await Promise.all([p4, p5]);
    expect(r4).toBe(true);
    expect(r5).toBe(false);
    expect(calls.length).toBe(2);
    expect(calls[1]!.length).toBe(2);
  });
});
