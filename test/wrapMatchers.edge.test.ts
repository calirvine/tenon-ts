import { object, string } from "valibot";
import { describe, it, expect } from "vitest";

import { flushAllBatchQueues, wrapMatchers } from "../src/wrapMatchers";

describe("wrapMatchers edge cases", () => {
  it("flushAllBatchQueues resolves all to false if evaluateBatch throws", async () => {
    const matchers = {
      test: {
        evaluateBatch: () => {
          throw new Error("fail");
        },
      },
    };
    const batchContext = {
      test: [
        [
          { params: {} },
          (result: boolean) => {
            expect(result).toBe(false);
          },
        ],
      ],
    };
    await flushAllBatchQueues(batchContext, matchers);
  });

  // 2. Batch matcher called without batchContext
  it("batch matcher throws if called without batchContext", async () => {
    const matchers = {
      test: {
        arguments: object({ foo: string() }),
        evaluateBatch: () => {},
      },
    };
    const wrapped = wrapMatchers(matchers);
    expect(() =>
      wrapped.test({ foo: "bar" })._evaluateInternal({
        params: {},
        arg: { foo: "bar" },
        cache: new Map(),
        segmentName: "seg",
        // no batchContext
      })
    ).toThrow(/batchContext is required/);
  });

  // 3. Argument validation error
  it("returns MatcherArgumentError for invalid matcher arguments", async () => {
    const matchers = {
      test: {
        arguments: object({ foo: string() }),
        evaluate: () => true,
      },
    };
    const wrapped = wrapMatchers(matchers);
    // @ts-expect-error: intentionally passing wrong type to test validation
    const resultAsync = wrapped.test({ foo: 123 })._evaluateInternal({
      params: {},
      arg: { foo: 123 },
      cache: new Map(),
      segmentName: "seg",
    });
    const result = await resultAsync;
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.name).toBe("MatcherArgumentError");
  });

  // 4. Matcher evaluation error
  it("returns MatcherEvaluationError if matcher evaluate throws", async () => {
    const matchers = {
      test: {
        arguments: object({ foo: string() }),
        evaluate: () => {
          throw new Error("fail");
        },
      },
    };
    const wrapped = wrapMatchers(matchers);
    const resultAsync = wrapped.test({ foo: "bar" })._evaluateInternal({
      params: {},
      arg: { foo: "bar" },
      cache: new Map(),
      segmentName: "seg",
    });
    const result = await resultAsync;
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.name).toBe("MatcherEvaluationError");
  });

  // 5. Memoization
  it("returns the same matcher instance for the same arguments", () => {
    const matchers = {
      test: {
        arguments: object({ foo: string() }),
        evaluate: () => true,
      },
    };
    const wrapped = wrapMatchers(matchers);
    const m1 = wrapped.test({ foo: "bar" });
    const m2 = wrapped.test({ foo: "bar" });
    expect(m1).toBe(m2);
  });
});
