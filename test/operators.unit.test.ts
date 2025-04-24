import { okAsync } from "neverthrow";
import { describe, it, expect } from "vitest";

import { createLogicalOperators } from "../src/operators";

import type { MatcherDefinition } from "../src/types";

describe("operators.ts", () => {
  const operators = createLogicalOperators<{ foo: boolean }>();
  const trueMatcher: MatcherDefinition<{ foo: boolean }> = {
    _evaluateInternal: () => okAsync(true),
    toNode: () => ({ type: "matcher", name: "true", args: [] }),
  };
  const falseMatcher: MatcherDefinition<{ foo: boolean }> = {
    _evaluateInternal: () => okAsync(false),
    toNode: () => ({ type: "matcher", name: "false", args: [] }),
  };

  it("and returns true if all matchers are true", async () => {
    const andMatcher = operators.and(trueMatcher, trueMatcher);
    const result = await andMatcher._evaluateInternal({
      params: { foo: true },
      arg: undefined,
      cache: new Map(),
    });
    expect(result.unwrapOr(false)).toBe(true);
  });

  it("and returns false if any matcher is false", async () => {
    const andMatcher = operators.and(trueMatcher, falseMatcher);
    const result = await andMatcher._evaluateInternal({
      params: { foo: true },
      arg: undefined,
      cache: new Map(),
    });
    expect(result.unwrapOr(false)).toBe(false);
  });

  it("or returns true if any matcher is true", async () => {
    const orMatcher = operators.or(falseMatcher, trueMatcher);
    const result = await orMatcher._evaluateInternal({
      params: { foo: true },
      arg: undefined,
      cache: new Map(),
    });
    expect(result.unwrapOr(false)).toBe(true);
  });

  it("or returns false if all matchers are false", async () => {
    const orMatcher = operators.or(falseMatcher, falseMatcher);
    const result = await orMatcher._evaluateInternal({
      params: { foo: true },
      arg: undefined,
      cache: new Map(),
    });
    expect(result.unwrapOr(false)).toBe(false);
  });

  it("not inverts the matcher result", async () => {
    const notMatcher = operators.not(trueMatcher);
    const result = await notMatcher._evaluateInternal({
      params: { foo: true },
      arg: undefined,
      cache: new Map(),
    });
    expect(result.unwrapOr(false)).toBe(false);
  });
});
