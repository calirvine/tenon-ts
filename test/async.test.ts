import { object, string, number } from "valibot";
import { describe, it, expect, vi } from "vitest";

import { TenonBuilder } from "../src/core.js";
import { MatcherEvaluationError } from "../src/errors";
import { noopLogger } from "../src/types";

// Add TestLogger for async tests
const TestLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
};

describe("Async Matcher Tests", () => {
  it("should execute matchers in parallel and cache results", async () => {
    const startTime = Date.now();
    const callCounts = new Map<string, number>();

    const subjectSchema = object({
      age: number(),
      country: string(),
    });

    const instance = new TenonBuilder(subjectSchema)
      .matchers((createMatcher) => ({
        slowMatcher1: createMatcher({
          evaluate: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            callCounts.set(
              "slowMatcher1",
              (callCounts.get("slowMatcher1") || 0) + 1
            );
            return params.age >= 18;
          },
        }),
        slowMatcher2: createMatcher({
          evaluate: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 75));
            callCounts.set(
              "slowMatcher2",
              (callCounts.get("slowMatcher2") || 0) + 1
            );
            return params.age >= 21;
          },
        }),
        slowMatcher3: createMatcher({
          evaluate: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            callCounts.set(
              "slowMatcher3",
              (callCounts.get("slowMatcher3") || 0) + 1
            );
            return params.country === "US";
          },
        }),
      }))
      .segments({
        parallelTest: ({ logicalOperators, matchers }) => {
          return logicalOperators.and(
            matchers.slowMatcher1(),
            matchers.slowMatcher2(),
            matchers.slowMatcher3()
          );
        },
      });

    const result = await instance.contextFor({ age: 25, country: "US" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("parallelTest");
    expect(match).toBe(true);
    // Should be around 100ms if parallel, giving a bit of leeway to prevent flakyness
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    expect(totalTime).toBeLessThan(120);
    expect(callCounts.get("slowMatcher1")).toBe(1);
    expect(callCounts.get("slowMatcher2")).toBe(1);
    expect(callCounts.get("slowMatcher3")).toBe(1);
  });

  it("should cache matcher results when used multiple times", async () => {
    const callCount = { value: 0 };

    const subjectSchema = object({
      age: number(),
    });

    const instance = new TenonBuilder(subjectSchema)
      .matchers((createMatcher) => ({
        cachedMatcher: createMatcher({
          evaluate: ({ params }) => {
            callCount.value++;
            return params.age >= 18;
          },
        }),
      }))
      .segments({
        cacheTest: ({ logicalOperators, matchers }) => {
          return logicalOperators.and(
            matchers.cachedMatcher(),
            matchers.cachedMatcher()
          );
        },
      });

    const result = await instance.contextFor({ age: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("cacheTest");
    expect(match).toBe(true);
    expect(callCount.value).toBe(1); // Should only be called once despite being used twice
  });

  it("should not cache matcher results when used across different segments", async () => {
    const callCount = { value: 0 };

    const subjectSchema = object({
      age: number(),
    });

    const instance = new TenonBuilder(subjectSchema)
      .matchers((createMatcher) => ({
        cachedMatcher: createMatcher({
          evaluate: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            callCount.value++;
            return params.age >= 18;
          },
        }),
      }))
      .segments({
        cacheTest: ({ logicalOperators, matchers }) => {
          return logicalOperators.and(
            matchers.cachedMatcher(),
            matchers.cachedMatcher()
          );
        },
        cacheTest2: ({ logicalOperators, matchers }) => {
          return logicalOperators.and(
            matchers.cachedMatcher(),
            matchers.cachedMatcher()
          );
        },
      });

    const result = await instance.contextFor({ age: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("cacheTest");
    expect(match).toBe(true);
    expect(callCount.value).toBe(1);

    const match2 = await result.matches("cacheTest2");
    expect(match2).toBe(true);
    expect(callCount.value).toBe(2);

    const match3 = await result.matches("cacheTest");
    expect(match3).toBe(true);
    expect(callCount.value).toBe(3);

    const match4 = await result.matches("cacheTest2");
    expect(match4).toBe(true);
    expect(callCount.value).toBe(4);
  });

  it("should support async matchers with evaluateBatch and batch in parallel", async () => {
    const callCount = { value: 0 };
    const subjectSchema = object({
      age: number(),
      country: string(),
    });
    const instance = new TenonBuilder(subjectSchema)
      .matchers((createMatcher) => ({
        isAdultFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluateBatch: async (batch) => {
            callCount.value++;
            for (const [ctx, resolve] of batch) {
              resolve(
                ctx.params.country === ctx.arg.country && ctx.params.age >= 18
              );
            }
          },
        }),
      }))
      .segments({
        adultCanadian: ({ matchers }) =>
          matchers.isAdultFromCountry({ country: "CA" }),
        adultAmerican: ({ matchers }) =>
          matchers.isAdultFromCountry({ country: "US" }),
      });
    const start = Date.now();
    const resultCA = await instance.contextFor({ age: 20, country: "CA" });
    expect(resultCA.ok).toBe(true);
    if (!resultCA.ok) throw new Error("Expected ok context");
    expect(await resultCA.matches("adultCanadian")).toBe(true);
    expect(await resultCA.matches("adultAmerican")).toBe(false);
    const resultUS = await instance.contextFor({ age: 17, country: "US" });
    expect(resultUS.ok).toBe(true);
    if (!resultUS.ok) throw new Error("Expected ok context");
    expect(await resultUS.matches("adultCanadian")).toBe(false);
    expect(await resultUS.matches("adultAmerican")).toBe(false);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // Should be batched/parallel
    expect(callCount.value).toBeGreaterThanOrEqual(1);
  });
});

describe("Async matcher error logging and error handling", () => {
  const schema = object({ userId: string() });
  const subject = { userId: "user-1" };

  it("should log MatcherEvaluationError with correct metadata for async throw after delay", async () => {
    const logger = { ...noopLogger, error: vi.fn() };
    const onError = vi.fn();
    const builder = new TenonBuilder(schema, { logger, onError })
      .matchers((createMatcher) => ({
        throwsAsyncDelayed: createMatcher({
          async evaluate() {
            await new Promise((resolve) => setTimeout(resolve, 10));
            throw new Error("async delayed fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.throwsAsyncDelayed(),
      });
    const ctx = await builder.contextFor(subject);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("Expected ok context");
    const result = await ctx.matches("test");
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "MatcherEvaluationError",
        matcherName: "throwsAsyncDelayed",
        segmentName: "test",
      })
    );
    const err = logger.error.mock.calls[0]![0];
    expect(err).toBeInstanceOf(MatcherEvaluationError);
    expect(err.matcherName).toBe("throwsAsyncDelayed");
    expect(err.segmentName).toBe("test");
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.message).toBe("async delayed fail");
    // onError should be called
    expect(onError).toHaveBeenCalled();
    const call = onError.mock.calls[0];
    expect(call).toBeDefined();
    if (call) {
      const errObj = call[0];
      const context = call[1];
      expect(errObj).toBeInstanceOf(MatcherEvaluationError);
      expect(context).toMatchObject({ segmentName: "test" });
    }
  });

  it("should log MatcherEvaluationError for async throw in one of multiple matchers", async () => {
    const logger = { ...noopLogger, error: vi.fn() };
    const onError = vi.fn();
    const builder = new TenonBuilder(schema, { logger, onError })
      .matchers((createMatcher) => ({
        alwaysTrue: createMatcher({
          async evaluate() {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return true;
          },
        }),
        throwsAsyncDelayed: createMatcher({
          async evaluate() {
            await new Promise((resolve) => setTimeout(resolve, 10));
            throw new Error("async delayed fail");
          },
        }),
      }))
      .segments({
        test: ({ logicalOperators, matchers }) =>
          logicalOperators.and(
            matchers.alwaysTrue(),
            matchers.throwsAsyncDelayed()
          ),
      });
    const ctx = await builder.contextFor(subject);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("Expected ok context");
    const result = await ctx.matches("test");
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "MatcherEvaluationError",
        matcherName: "throwsAsyncDelayed",
        segmentName: "test",
      })
    );
    const err = logger.error.mock.calls[0]![0];
    expect(err).toBeInstanceOf(MatcherEvaluationError);
    expect(err.matcherName).toBe("throwsAsyncDelayed");
    expect(err.segmentName).toBe("test");
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.message).toBe("async delayed fail");
    // onError should be called
    expect(onError).toHaveBeenCalled();
    const call = onError.mock.calls[0];
    expect(call).toBeDefined();
    if (call) {
      const errObj = call[0];
      const context = call[1];
      expect(errObj).toBeInstanceOf(MatcherEvaluationError);
      expect(context).toMatchObject({ segmentName: "test" });
    }
  });
});

describe("Fallback callback integration (async)", () => {
  it("calls fallback callback for async matcher error (sync)", async () => {
    const schema = object({ userId: string() });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        throwsAsync: createMatcher({
          async evaluate() {
            throw new Error("fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.throwsAsync(),
      });
    const ctx = await instance.contextFor({ userId: "abc" });
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("Expected ok context");
    let called = false;
    const fallback = (errors: Error[]) => {
      called = true;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors[0]).toBeInstanceOf(Error);
      return true;
    };
    const match = await ctx.matches("test", fallback);
    expect(match).toBe(true);
    expect(called).toBe(true);
  });

  it("calls fallback callback for async matcher error (async)", async () => {
    const schema = object({ userId: string() });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        throwsAsync: createMatcher({
          async evaluate() {
            throw new Error("fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.throwsAsync(),
      });
    const ctx = await instance.contextFor({ userId: "abc" });
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("Expected ok context");
    let called = false;
    const fallback = async (errors: Error[]) => {
      called = true;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors[0]).toBeInstanceOf(Error);
      return false;
    };
    const match = await ctx.matches("test", fallback);
    expect(match).toBe(false);
    expect(called).toBe(true);
  });
});
