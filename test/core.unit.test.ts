import { describe, it, expect } from "vitest";

import { TenonBuilder } from "../src/core";
import { makeCreateMatcher } from "../src/matcher";

import type { Schema } from "../src/types";

describe("core.ts", () => {
  it("should build a segment pipeline and match as expected", async () => {
    const subjectSchema = {
      "~standard": {
        validate: (input) => ({ value: input }),
      },
    } as Schema;
    const builder = new TenonBuilder(subjectSchema)
      .matchers((createMatcher) => ({
        isFoo: createMatcher({
          evaluate: ({ params }) => params.foo === true,
        }),
      }))
      .segments({
        fooSegment: ({ matchers }) => matchers.isFoo(),
      });
    const result = await builder.contextFor({ foo: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("fooSegment");
    expect(match).toBe(true);
    const result2 = await builder.contextFor({ foo: false });
    expect(result2.ok).toBe(true);
    if (!result2.ok) throw new Error("Expected ok context");
    const match2 = await result2.matches("fooSegment");
    expect(match2).toBe(false);
  });
});

describe("createMatcher mutual exclusivity", () => {
  it("should default to evaluateBatch if both evaluate and evaluateBatch are provided", () => {
    const createMatcher = makeCreateMatcher();
    const evaluate = () => false;
    const evaluateBatch = () => {};
    const matcher = createMatcher({ evaluate, evaluateBatch });
    expect(matcher.evaluate).toBeUndefined();
    expect(matcher.evaluateBatch).toBe(evaluateBatch);
  });
});
