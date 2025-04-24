import { describe, it, expect } from "vitest";
import {
  createSegmentBuilder,
  type LogicalOperators,
  type SegmentMatchers,
} from "../src/core.js";
import { object, string, number, optional } from "valibot";
import type { StandardSchemaV1 } from "@standard-schema/spec";

describe("Async Matcher Tests", () => {
  it("should execute matchers in parallel and cache results", async () => {
    const startTime = Date.now();
    const callCounts = new Map<string, number>();

    const schema = object({
      age: number(),
      country: string(),
    });
    type Params = StandardSchemaV1.InferOutput<typeof schema>;

    const instance = createSegmentBuilder(schema)
      .matchers((createMatcher) => ({
        slowMatcher1: createMatcher({
          evaluate: async (params: Params) => {
            callCounts.set(
              "slowMatcher1",
              (callCounts.get("slowMatcher1") || 0) + 1
            );
            await new Promise((resolve) => setTimeout(resolve, 50));
            return params.age >= 18;
          },
        }),
        slowMatcher2: createMatcher({
          evaluate: async (params: Params) => {
            callCounts.set(
              "slowMatcher2",
              (callCounts.get("slowMatcher2") || 0) + 1
            );
            await new Promise((resolve) => setTimeout(resolve, 75));
            return params.age >= 21;
          },
        }),
        slowMatcher3: createMatcher({
          evaluate: async (params: Params) => {
            callCounts.set(
              "slowMatcher3",
              (callCounts.get("slowMatcher3") || 0) + 1
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
            return params.country === "US";
          },
        }),
      }))
      .segments({
        parallelTest: async (
          params,
          { and },
          { slowMatcher1, slowMatcher2, slowMatcher3 }
        ) => {
          return and(slowMatcher1(), slowMatcher2(), slowMatcher3());
        },
      });

    const [err, ctx] = await instance.contextFor({ age: 25, country: "US" });
    expect(err).toBeUndefined();
    const result = await ctx!.matches("parallelTest");

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    expect(result).toBe(true);
    expect(totalTime).toBeLessThan(150); // Should be around 100ms if parallel
    expect(callCounts.get("slowMatcher1")).toBe(1);
    expect(callCounts.get("slowMatcher2")).toBe(1);
    expect(callCounts.get("slowMatcher3")).toBe(1);
  });

  it("should cache matcher results when used multiple times", async () => {
    const callCount = { value: 0 };

    const schema = object({
      age: number(),
    });
    type Params = StandardSchemaV1.InferOutput<typeof schema>;

    const instance = createSegmentBuilder(schema)
      .matchers((createMatcher) => ({
        cachedMatcher: createMatcher({
          evaluate: async (params: Params) => {
            callCount.value++;
            await new Promise((resolve) => setTimeout(resolve, 10));
            return params.age >= 18;
          },
        }),
      }))
      .segments({
        cacheTest: async (params, { and }, { cachedMatcher }) => {
          return and(cachedMatcher(), cachedMatcher());
        },
      });

    const [err, ctx] = await instance.contextFor({ age: 20 });
    expect(err).toBeUndefined();
    const result = await ctx!.matches("cacheTest");

    expect(result).toBe(true);
    expect(callCount.value).toBe(1); // Should only be called once despite being used twice
  });
});
