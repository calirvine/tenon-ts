import { describe, it, expect, vi } from "vitest";

import { flushAllBatchQueues } from "../src/wrapMatchers";

describe("flushAllBatchQueues", () => {
  it("should call evaluateBatch on the original matcher object", async () => {
    const evaluateBatch = vi.fn((batch) => {
      for (const [, resolve] of batch) {
        resolve(true);
      }
    });
    const matchers = {
      testMatcher: { evaluateBatch },
    };
    const batchContext = {
      testMatcher: [
        [{ params: { foo: "bar" }, cache: {} }, vi.fn()],
        [{ params: { foo: "baz" }, cache: {} }, vi.fn()],
      ],
    };
    await flushAllBatchQueues(batchContext, matchers);
    expect(evaluateBatch).toHaveBeenCalledTimes(1);
    const batchArg = evaluateBatch.mock.calls[0]![0];
    expect(batchArg.length).toBe(2);
  });
});
