import { object as valibotObject, string as valibotString } from "valibot";
import { describe, it, expect, vi } from "vitest";

import { makeCreateMatcher } from "../src/matcher";

import type { ResultAsync } from "neverthrow";

describe("matcher.ts", () => {
  it("should create a matcher object with a working _evaluateInternal", async () => {
    const createMatcher = makeCreateMatcher<{ foo: string }>();
    const evaluate = vi.fn(({ params, arg }) => params.foo === arg.bar);
    const matcherObj = createMatcher({
      arguments: valibotObject({ bar: valibotString() }),
      evaluate,
    });

    const params = { foo: "baz" };
    const arg = { bar: "baz" };
    const cache = new Map();
    const result = matcherObj.evaluate!({ params, arg, cache });
    expect(result).toBe(true);
    expect(evaluate).toHaveBeenCalledWith({ params, arg, cache });
  });

  it("should create a matcher object with evaluateBatch (with arguments)", async () => {
    const createMatcher = makeCreateMatcher<{ foo: string }>();
    const evaluateBatch = vi.fn((batch) => {
      for (const [ctx, resolve] of batch) {
        resolve(ctx.params.foo === ctx.arg.bar);
      }
    });
    const matcherObj = createMatcher({
      arguments: valibotObject({ bar: valibotString() }),
      evaluateBatch,
    });
    const params1 = { foo: "baz" };
    const params2 = { foo: "qux" };
    const arg1 = { bar: "baz" };
    const arg2 = { bar: "qux" };
    const cache = new Map();
    const batch: [
      {
        params: { foo: string };
        arg: { bar: string };
        cache: Map<string, ResultAsync<boolean, Error>>;
      },
      (v: boolean) => void,
    ][] = [
      [{ params: params1, arg: arg1, cache }, (v: boolean) => results.push(v)],
      [{ params: params2, arg: arg2, cache }, (v: boolean) => results.push(v)],
    ];
    const results: boolean[] = [];
    await matcherObj.evaluateBatch!(batch);
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
    expect(evaluateBatch).toHaveBeenCalledTimes(1);
    expect(evaluateBatch.mock.calls[0]![0].length).toBe(2);
  });

  it("should create a matcher object with evaluateBatch (no arguments)", async () => {
    const createMatcher = makeCreateMatcher<{ foo: string }>();
    const evaluateBatch = vi.fn((batch) => {
      for (const [ctx, resolve] of batch) {
        resolve(ctx.params.foo === "baz");
      }
    });
    const matcherObj = createMatcher({
      evaluateBatch,
    });
    const params1 = { foo: "baz" };
    const params2 = { foo: "qux" };
    const cache = new Map();
    const batch: [
      {
        params: { foo: string };
        cache: Map<string, ResultAsync<boolean, Error>>;
      },
      (v: boolean) => void,
    ][] = [
      [{ params: params1, cache }, (v: boolean) => results.push(v)],
      [{ params: params2, cache }, (v: boolean) => results.push(v)],
    ];
    const results: boolean[] = [];
    await matcherObj.evaluateBatch!(batch);
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(false);
    expect(evaluateBatch).toHaveBeenCalledTimes(1);
    expect(evaluateBatch.mock.calls[0]![0].length).toBe(2);
  });
});
