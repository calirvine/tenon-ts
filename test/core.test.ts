import { object, string, number, optional } from "valibot";
import { describe, it, expect, vi } from "vitest";

import { TenonBuilder } from "../src/core.js";
import { MatcherArgumentError, MatcherEvaluationError } from "../src/errors";
import { noopLogger } from "../src/types";

const TestLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
};

describe("Tenon-ts", () => {
  it("should allow defining segments with required and optional parameters", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
      age: optional(number()),
      subscription: optional(string()),
    });

    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: ({ params, arg }) => {
            return arg.country === params.country;
          },
        }),
        ageGreaterThan: createMatcher({
          arguments: object({ age: number() }),
          evaluate: ({ params, arg }) => {
            return typeof params.age === "number" && params.age >= arg.age;
          },
        }),
        isPremiumUser: createMatcher({
          evaluate: ({ params }) => {
            return (
              typeof params.userId === "string" &&
              params.userId.startsWith("premium-")
            );
          },
        }),
        isAdult: createMatcher({
          evaluate: ({ params }) => {
            return typeof params.age === "number" && params.age >= 18;
          },
        }),
      }))
      .segments({
        adult: ({ matchers }) => matchers.isAdult(),
        premium: ({ matchers }) => matchers.isPremiumUser(),
        canadian: ({ matchers }) => matchers.isFromCountry({ country: "CA" }),
        usAdult: ({ logicalOperators, matchers }) =>
          logicalOperators.and(
            matchers.isFromCountry({ country: "US" }),
            matchers.isAdult()
          ),
        complexSegment: ({ logicalOperators, matchers }) =>
          logicalOperators.or(
            matchers.isFromCountry({ country: "CA" }),
            logicalOperators.and(
              matchers.isFromCountry({ country: "US" }),
              matchers.ageGreaterThan({ age: 21 })
            )
          ),
      });

    // Test matching
    let result = await instance.contextFor({
      userId: "user-123",
      age: 25,
      country: "US",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("adult")).toBe(true);

    result = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("adult")).toBe(false);

    result = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("usAdult")).toBe(false);
    expect(await result.matches("premium")).toBe(true);

    result = await instance.contextFor({
      userId: "123",
      age: 17,
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("premium")).toBe(false);

    // Can also use generic matcher
    result = await instance.contextFor({
      userId: "user-123",
      age: 25,
      country: "US",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("adult")).toBe(true);

    result = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("adult")).toBe(false);
  });

  it("should work with isFromCountry matcher", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
      age: optional(number()),
    });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: ({ params, arg }) => {
            const result = arg.country === params.country;
            return result;
          },
        }),
      }))
      .segments({
        canadian: ({ logicalOperators, matchers }) => {
          return logicalOperators.and(
            matchers.isFromCountry({ country: "CA" })
          );
        },
      });
    // Test with Canadian user
    let result = await instance.contextFor({
      userId: "user-123",
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("canadian")).toBe(true);
    result = await instance.contextFor({
      userId: "user-123",
      country: "US",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("canadian")).toBe(false);
    // Test with US user
    result = await instance.contextFor({
      userId: "user-456",
      country: "US",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("canadian")).toBe(false);
    result = await instance.contextFor({
      userId: "user-456",
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("canadian")).toBe(true);
  });

  it("should work with complex matcher expressions and caching", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
      age: optional(number()),
      subscription: optional(string()),
    });

    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: ({ params, arg }) => {
            const result = arg.country === params.country;
            return result;
          },
        }),
        ageGreaterThan: createMatcher({
          arguments: object({ age: number() }),
          evaluate: ({ params, arg }) => {
            const result =
              typeof params.age === "number" && params.age >= arg.age;
            return result;
          },
        }),
        isPremiumUser: createMatcher({
          evaluate: ({ params }) => {
            const result =
              typeof params.userId === "string" &&
              params.userId.startsWith("premium-");
            return result;
          },
        }),
      }))
      .segments({
        complexSegment: ({ logicalOperators, matchers }) =>
          logicalOperators.or(
            matchers.isFromCountry({ country: "CA" }),
            logicalOperators.and(
              matchers.isFromCountry({ country: "US" }),
              matchers.ageGreaterThan({ age: 21 })
            )
          ),
      });
    // Test complex segment with various combinations
    let result = await instance.contextFor({
      userId: "user-123",
      age: 25,
      country: "US",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("complexSegment")).toBe(true);
    let result2 = await instance.contextFor({
      userId: "premium-456",
      country: "US",
      age: 17,
    });
    expect(result2.ok).toBe(true);
    if (!result2.ok) throw new Error("Expected ok context");
    expect(await result2.matches("complexSegment")).toBe(false);
    result = await instance.contextFor({
      userId: "user-123",
      age: 17,
      country: "CA",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const actual2 = await result.matches("complexSegment");
    expect(actual2).toBe(true);
  });

  it("should return errors when input does not match schema", async () => {
    const schema = object({
      userId: string(),
      age: number(),
    });
    const logger = {
      ...noopLogger,
      error: vi.fn(),
    };
    const instance = new TenonBuilder(schema, { logger })
      .matchers((createMatcher) => ({
        isAdult: createMatcher({
          evaluate: ({ params }) => params.age >= 18,
        }),
      }))
      .segments({
        adult: ({ matchers }) => {
          return matchers.isAdult();
        },
      });

    let errorResult = await instance.contextFor({
      // @ts-expect-error: intentionally passing wrong type to test validation
      userId: 123,
      // @ts-expect-error: intentionally passing wrong type to test validation
      age: "not-a-number",
    });

    expect(errorResult.ok).toBe(false);
    if (errorResult.ok) throw new Error("Expected error result");
    expect(Array.isArray(errorResult.issues)).toBe(true);
    expect(errorResult.issues.length).toBeGreaterThan(0);
    expect(errorResult.issues[0]!.message).toMatch(
      /Expected string but received \d+/
    );
  });

  it("should return MatcherArgumentError for invalid matcher arguments", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
    });
    const logger = {
      ...noopLogger,
      error: vi.fn(),
    };
    const onError = vi.fn();

    const instance = new TenonBuilder(schema, { logger, onError })
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: ({ params, arg }) => arg.country === params.country,
        }),
      }))
      .segments({
        test: ({ matchers }) => {
          // Pass invalid argument (missing 'country')
          // @ts-expect-error: intentionally passing wrong type to test validation
          return matchers.isFromCountry({});
        },
      });
    const result = await instance.contextFor({ userId: "abc" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const matchResult = await result.matches("test");
    expect(matchResult).toBe(false);
    const err = logger.error.mock.calls[0]![0];
    expect(err).toBeInstanceOf(MatcherArgumentError);
    expect(err.matcherName).toBe("isFromCountry");
    expect(err.segmentName).toBe("test");
    // onError should be called
    expect(onError).toHaveBeenCalled();
    const call = onError.mock.calls[0];
    expect(call).toBeDefined();
    if (call) {
      const errObj = call[0];
      const context = call[1];
      expect(errObj).toBeInstanceOf(MatcherArgumentError);
      expect(context).toMatchObject({ segmentName: "test" });
    }
  });

  it("should support ad-hoc segments", async () => {
    const schema = object({
      userId: string(),
      country: string(),
      age: number(),
      role: string(),
    });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: ({ params, arg }) => arg.country === params.country,
        }),

        isAdmin: createMatcher({
          evaluate: ({ params }) => params.role === "admin",
        }),
      }))
      .segments({
        admin: ({ matchers }) => matchers.isAdmin(),
      });
    const result = await instance.contextFor({
      userId: "admin",
      country: "US",
      age: 30,
      role: "admin",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(
      await result.matches(
        ({ logicalOperators: { and }, matchers: { isAdmin, isFromCountry } }) =>
          and(isFromCountry({ country: "US" }), isAdmin())
      )
    ).toBe(true);
  });

  it("should support matchers with evaluateBatch (with arguments)", async () => {
    const schema = object({
      userId: string(),
      country: string(),
    });
    const evaluateBatchFn = vi.fn((batch) => {
      for (const [ctx, resolve] of batch) {
        resolve(ctx.params.country === ctx.arg.country);
      }
    });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluateBatch: (batch) => evaluateBatchFn(batch),
        }),
      }))
      .segments({
        canadian: ({ matchers }) => matchers.isFromCountry({ country: "CA" }),
        american: ({ matchers }) => matchers.isFromCountry({ country: "US" }),
      });
    const resultCA = await instance.contextFor({ userId: "u1", country: "CA" });
    expect(resultCA.ok).toBe(true);
    if (!resultCA.ok) throw new Error("Expected ok context");
    expect(await resultCA.matches("canadian")).toBe(true);
    expect(await resultCA.matches("american")).toBe(false);
    const resultUS = await instance.contextFor({ userId: "u2", country: "US" });
    expect(resultUS.ok).toBe(true);
    if (!resultUS.ok) throw new Error("Expected ok context");
    expect(await resultUS.matches("canadian")).toBe(false);
    expect(await resultUS.matches("american")).toBe(true);
    expect(evaluateBatchFn).toHaveBeenCalled();
  });
});

describe("Matcher error logging and error handling", () => {
  const schema = object({ userId: string() });
  const subject = { userId: "user-1" };

  it("should log MatcherEvaluationError with correct metadata for sync throw", async () => {
    const logger = { ...noopLogger, error: vi.fn() };
    const onError = vi.fn();
    const builder = new TenonBuilder(schema, { logger, onError })
      .matchers((createMatcher) => ({
        throwsSync: createMatcher({
          evaluate: () => {
            throw new Error("sync fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.throwsSync(),
      });
    const ctx = await builder.contextFor(subject);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("Expected ok context");
    const result = await ctx.matches("test");
    expect(result).toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "MatcherEvaluationError",
        matcherName: "throwsSync",
        segmentName: "test",
      })
    );
    const err = logger.error.mock.calls[0]![0];
    expect(err).toBeInstanceOf(MatcherEvaluationError);
    expect(err.matcherName).toBe("throwsSync");
    expect(err.segmentName).toBe("test");
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.message).toBe("sync fail");
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

  it("should log MatcherEvaluationError with correct metadata for async throw", async () => {
    const logger = {
      ...noopLogger,
      error: vi.fn(),
    };
    const onError = vi.fn();
    const builder = new TenonBuilder(schema, { logger, onError })
      .matchers((createMatcher) => ({
        throwsAsync: createMatcher({
          async evaluate() {
            throw new Error("async fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.throwsAsync(),
      });
    const ctx = await builder.contextFor(subject);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("Expected ok context");
    const result = await ctx.matches("test");
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "MatcherEvaluationError",
        matcherName: "throwsAsync",
        segmentName: "test",
      })
    );
    const err = logger.error.mock.calls[0]![0];
    expect(err).toBeInstanceOf(MatcherEvaluationError);
    expect(err.matcherName).toBe("throwsAsync");
    expect(err.segmentName).toBe("test");
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.message).toBe("async fail");
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

describe("primitive subject schema", () => {
  it("should allow segment matching for a primitive subject (string)", async () => {
    // StandardSchema-compliant string schema
    const schema = string();
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        isHello: createMatcher({
          evaluate: ({ params }) => params === "hello",
        }),
      }))
      .segments({
        hello: ({ matchers }) => matchers.isHello(),
      });
    const result = await instance.contextFor("hello");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("hello")).toBe(true);
    // @ts-expect-error: intentionally passing wrong type to test validation
    const failResult = await instance.contextFor(123);
    expect(failResult.ok).toBe(false);
    if (failResult.ok) throw new Error("Expected error context");
    expect(failResult.issues[0]!.message).toMatch(/Expected string/);
  });
});

describe("Fallback callback integration (core)", () => {
  it("calls fallback callback for segment matcher error (sync)", async () => {
    const schema = object({ userId: string() });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        alwaysThrows: createMatcher({
          evaluate: () => {
            throw new Error("fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.alwaysThrows(),
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

  it("calls fallback callback for segment matcher error (async)", async () => {
    const schema = object({ userId: string() });
    const instance = new TenonBuilder(schema, { logger: TestLogger })
      .matchers((createMatcher) => ({
        alwaysThrows: createMatcher({
          evaluate: () => {
            throw new Error("fail");
          },
        }),
      }))
      .segments({
        test: ({ matchers }) => matchers.alwaysThrows(),
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
