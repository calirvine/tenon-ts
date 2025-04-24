import { ResultAsync } from "neverthrow";
import { object } from "valibot";
import { describe, it, expect, vi } from "vitest";

import { getNoopTracer } from "../src/internal/otel";
import { createSegmentEvaluator } from "../src/segment";
import {
  type LogicalOperators,
  type Schema,
  type SegmentContextObject,
  type MatcherDefinition,
  type MatcherMap,
} from "../src/types";

const TestLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
};

describe("segment.ts", () => {
  it("should evaluate a segment with a matcher and return the expected result", async () => {
    const schema = {
      "~standard": {
        validate: (input: unknown) => ({ value: input }),
      },
    } as Schema;
    const segmentsObj = {
      testSegment: (
        context: SegmentContextObject<
          { userId?: string },
          MatcherMap<{ userId?: string }>
        >
      ): MatcherDefinition<{ userId?: string }> =>
        context.matchers.alwaysTrue!(),
    };
    const operators: LogicalOperators<{ userId?: string }> = {
      and: (...matchers: MatcherDefinition<{ userId?: string }>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<{ userId?: string }>),
      or: (...matchers: MatcherDefinition<{ userId?: string }>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<{ userId?: string }>),
      not: (matcher: MatcherDefinition<{ userId?: string }>) => matcher,
    };
    const wrappedMatchers = {
      alwaysTrue: () => ({
        _evaluateInternal: ({ params }: { params: { userId?: string } }) => {
          if (params.userId === "fail") throw new Error("fail");
          return ResultAsync.fromPromise(
            Promise.resolve(true),
            (e) => e as Error
          );
        },
        toNode: () => ({
          type: "matcher" as const,
          name: "alwaysTrue",
          args: [] as unknown[],
        }),
      }),
    };
    const rawMatchers = {
      alwaysTrue: {
        evaluate: (_context: { params: { userId?: string } }) => true,
      },
    };
    const contextFor = createSegmentEvaluator(
      schema,
      segmentsObj,
      operators,
      wrappedMatchers,
      rawMatchers,
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor({ foo: "bar" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("testSegment");
    expect(match).toBe(true);
    const result2 = await contextFor({ foo: "baz" });
    expect(result2.ok).toBe(true);
    if (!result2.ok) throw new Error("Expected ok context");
    const match2 = await result2.matches("testSegment");
    expect(match2).toBe(true);
  });
});

describe("segment.ts edge/error cases", () => {
  it("returns error if schema validation result has no value", async () => {
    const baseSchema = object({});
    const schema = {
      ...baseSchema,
      "~standard": {
        ...baseSchema["~standard"],
        validate: (_: unknown) => ({}) as { value?: unknown },
      },
    } as unknown as Schema;
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
    };
    const contextFor = createSegmentEvaluator(
      schema,
      {},
      operators,
      {},
      {},
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor("foo");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error context");
    expect(result.issues[0]!.message).toMatch(
      /Schema validation did not return a valid value/
    );
  });

  it("returns false and logs error if ad-hoc segment matcher throws", async () => {
    const baseSchema = object({});
    const schema = {
      ...baseSchema,
      "~standard": {
        ...baseSchema["~standard"],
        validate: (input: unknown) => ({ value: input }),
      },
    } as unknown as Schema;
    const logger = { ...TestLogger, error: vi.fn() };
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
    };
    const contextFor = createSegmentEvaluator(
      schema,
      {},
      operators,
      {},
      {},
      logger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches(() => {
      throw new Error("fail");
    });
    expect(match).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns false and logs error if named segment matcher throws", async () => {
    const baseSchema = object({});
    const schema = {
      ...baseSchema,
      "~standard": {
        ...baseSchema["~standard"],
        validate: (input: unknown) => ({ value: input }),
      },
    } as unknown as Schema;
    const logger = { ...TestLogger, error: vi.fn() };
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
    };
    const segments = {
      test: () => ({
        _evaluateInternal: () => {
          throw new Error("fail");
        },
        toNode: () => ({
          type: "matcher" as const,
          name: "test",
          args: [] as unknown[],
        }),
      }),
    };
    const contextFor = createSegmentEvaluator(
      schema,
      segments,
      operators,
      {},
      {},
      logger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("test");
    expect(match).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it("sets tracing error attributes if matcher throws (mock tracer)", async () => {
    const baseSchema = object({});
    const schema = {
      ...baseSchema,
      "~standard": {
        ...baseSchema["~standard"],
        validate: (input: unknown) => ({ value: input }),
      },
    } as unknown as Schema;
    const errorAttrs: Record<string, unknown> = {};
    const mockSpan = {
      end: vi.fn(),
      setAttribute: (k: string, v: unknown) => {
        errorAttrs[k] = v;
      },
      setStatus: vi.fn(),
    };
    const mockTracer = {
      startSpan: vi.fn(() => mockSpan),
    };
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
    };
    const segments = {
      test: () => ({
        _evaluateInternal: () => {
          throw new Error("fail");
        },
        toNode: () => ({
          type: "matcher" as const,
          name: "test",
          args: [] as unknown[],
        }),
      }),
    };
    const contextFor = createSegmentEvaluator(
      schema,
      segments,
      operators,
      {},
      {},
      TestLogger,
      mockTracer
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches(() => {
      throw new Error("fail");
    });
    expect(match).toBe(false);
    expect(errorAttrs["error.name"]).toBe("Error");
    expect(errorAttrs["error.message"]).toBe("fail");
  });
});

describe("segment.ts schema validation edge cases", () => {
  it.each([
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "number", value: 42 },
    { label: "string", value: "foo" },
  ])(
    "returns error if schema validation result value is $label",
    async ({ value }) => {
      const baseSchema = object({});
      const schema = {
        ...baseSchema,
        "~standard": {
          ...baseSchema["~standard"],
          validate: (_: unknown) => ({ value }),
        },
      } as unknown as Schema;
      const operators: LogicalOperators<Record<string, unknown>> = {
        and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
      };
      const contextFor = createSegmentEvaluator(
        schema,
        {},
        operators,
        {},
        {},
        TestLogger,
        getNoopTracer()
      );
      const result = await contextFor({});
      expect(result.ok).toBe(true);
    }
  );
});

describe("segment.ts ad-hoc matcher error handling", () => {
  it.each([
    {
      label: "rejected Promise",
      fn: () =>
        ResultAsync.fromPromise<boolean, Error>(
          Promise.reject(new Error("fail")),
          (e) => e as Error
        ),
      expectError: /fail/,
    },
    {
      label: "throws string",
      fn: () => {
        throw "failstr";
      },
      expectError: /failstr/,
    },
    {
      label: "throws number",
      fn: () => {
        throw 123;
      },
      expectError: /123/,
    },
  ])(
    "returns false and logs error if ad-hoc matcher $label",
    async ({ fn, expectError }) => {
      const baseSchema = object({});
      const schema = {
        ...baseSchema,
        "~standard": {
          ...baseSchema["~standard"],
          validate: (input: unknown) => ({ value: input }),
        },
      } as unknown as Schema;
      const logger = { ...TestLogger, error: vi.fn() };
      const onError = vi.fn();
      const operators: LogicalOperators<Record<string, unknown>> = {
        and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
      };
      const contextFor = createSegmentEvaluator(
        schema,
        {},
        operators,
        {},
        {},
        logger,
        getNoopTracer(),
        onError
      );
      const result = await contextFor({});
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected ok context");
      const match = await result.matches(() => ({
        _evaluateInternal: fn,
        toNode: () => ({
          type: "matcher" as const,
          name: "test",
          args: [] as unknown[],
        }),
      }));
      expect(match).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(expect.anything());
      expect(onError).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything()
      );
      const err = (logger.error as { mock?: { calls?: unknown[][] } }).mock
        ?.calls?.[0]?.[0];
      expect(String(err)).toMatch(expectError);
    }
  );
});

describe("segment.ts named matcher error handling", () => {
  it.each([
    {
      label: "rejected Promise",
      fn: () =>
        ResultAsync.fromPromise<boolean, Error>(
          Promise.reject(new Error("fail")),
          (e) => e as Error
        ),
      expectError: /fail/,
    },
    {
      label: "throws string",
      fn: () => {
        throw "failstr";
      },
      expectError: /failstr/,
    },
    {
      label: "throws number",
      fn: () => {
        throw 123;
      },
      expectError: /123/,
    },
  ])(
    "returns false and logs error if named matcher $label",
    async ({ fn, expectError }) => {
      const baseSchema = object({});
      const schema = {
        ...baseSchema,
        "~standard": {
          ...baseSchema["~standard"],
          validate: (input: unknown) => ({ value: input }),
        },
      } as unknown as Schema;
      const logger = { ...TestLogger, error: vi.fn() };
      const onError = vi.fn();
      const operators: LogicalOperators<Record<string, unknown>> = {
        and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
      };
      const segments = {
        test: () => ({
          _evaluateInternal: () => fn(),
          toNode: () => ({
            type: "matcher" as const,
            name: "test",
            args: [] as unknown[],
          }),
        }),
      };
      const contextFor = createSegmentEvaluator(
        schema,
        segments,
        operators,
        {},
        {},
        logger,
        getNoopTracer(),
        onError
      );
      const result = await contextFor({});
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected ok context");
      const match = await result.matches("test");
      expect(match).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(expect.anything());
      expect(onError).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything()
      );
      const err = (logger.error as { mock?: { calls?: unknown[][] } }).mock
        ?.calls?.[0]?.[0];
      expect(String(err)).toMatch(expectError);
    }
  );
});

describe("segment.ts tracing error attributes for all error types", () => {
  it.each([
    {
      label: "Error",
      fn: () => {
        throw new Error("fail");
      },
      expectName: "Error",
      expectMsg: "fail",
    },
    {
      label: "string",
      fn: () => {
        throw "failstr";
      },
      expectName: "Error",
      expectMsg: "failstr",
    },
    {
      label: "number",
      fn: () => {
        throw 123;
      },
      expectName: "Error",
      expectMsg: "123",
    },
  ])(
    "sets tracing error attributes if matcher throws $label",
    async ({ fn, expectName, expectMsg }) => {
      const baseSchema = object({});
      const schema = {
        ...baseSchema,
        "~standard": {
          ...baseSchema["~standard"],
          validate: (input: unknown) => ({ value: input }),
        },
      } as unknown as Schema;
      const errorAttrs: Record<string, unknown> = {};
      const mockSpan = {
        end: vi.fn(),
        setAttribute: (k: string, v: unknown) => {
          errorAttrs[k] = v;
        },
        setStatus: vi.fn(),
      };
      const mockTracer = {
        startSpan: vi.fn(() => mockSpan),
      };
      const operators: LogicalOperators<Record<string, unknown>> = {
        and: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        or: (...matchers: MatcherDefinition<Record<string, unknown>>[]) =>
          matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
        not: (matcher: MatcherDefinition<Record<string, unknown>>) => matcher,
      };
      const segments = {
        test: () => ({
          _evaluateInternal: () => fn(),
          toNode: () => ({
            type: "matcher" as const,
            name: "test",
            args: [] as unknown[],
          }),
        }),
      };
      const contextFor = createSegmentEvaluator(
        schema,
        segments,
        operators,
        {},
        {},
        TestLogger,
        mockTracer
      );
      const result = await contextFor({});
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected ok context");
      const match = await result.matches(() => ({
        _evaluateInternal: fn,
        toNode: () => ({
          type: "matcher" as const,
          name: "test",
          args: [] as unknown[],
        }),
      }));
      expect(match).toBe(false);
      expect(errorAttrs["error.name"]).toBe(expectName);
      expect(errorAttrs["error.message"]).toBe(expectMsg);
    }
  );
});

describe("segment.ts fallback callback", () => {
  it("calls fallback callback for ad-hoc matcher error (sync)", async () => {
    const schema = {
      "~standard": { validate: (input: unknown) => ({ value: input }) },
    } as Schema;
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher) => matcher,
    };
    const contextFor = createSegmentEvaluator(
      schema,
      {},
      operators,
      {},
      {},
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    let called = false;
    const fallback = (errors: Error[]) => {
      called = true;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors[0]).toBeInstanceOf(Error);
      return true;
    };
    const match = await result.matches(() => {
      throw new Error("fail");
    }, fallback);
    expect(match).toBe(true);
    expect(called).toBe(true);
  });

  it("calls fallback callback for ad-hoc matcher error (async)", async () => {
    const schema = {
      "~standard": { validate: (input: unknown) => ({ value: input }) },
    } as Schema;
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher) => matcher,
    };
    const contextFor = createSegmentEvaluator(
      schema,
      {},
      operators,
      {},
      {},
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    let called = false;
    const fallback = async (errors: Error[]) => {
      called = true;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors[0]).toBeInstanceOf(Error);
      return false;
    };
    const match = await result.matches(() => {
      throw new Error("fail");
    }, fallback);
    expect(match).toBe(false);
    expect(called).toBe(true);
  });

  it("calls fallback callback for named segment error (sync)", async () => {
    const schema = {
      "~standard": { validate: (input: unknown) => ({ value: input }) },
    } as Schema;
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher) => matcher,
    };
    const segments = {
      test: () => ({
        _evaluateInternal: () => {
          throw new Error("fail");
        },
        toNode: () => ({ type: "matcher" as const, name: "test", args: [] }),
      }),
    };
    const contextFor = createSegmentEvaluator(
      schema,
      segments,
      operators,
      {},
      {},
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    let called = false;
    const fallback = (errors: Error[]) => {
      called = true;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors[0]).toBeInstanceOf(Error);
      return true;
    };
    const match = await result.matches("test", fallback);
    expect(match).toBe(true);
    expect(called).toBe(true);
  });

  it("calls fallback callback for named segment error (async)", async () => {
    const schema = {
      "~standard": { validate: (input: unknown) => ({ value: input }) },
    } as Schema;
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher) => matcher,
    };
    const segments = {
      test: () => ({
        _evaluateInternal: () => {
          throw new Error("fail");
        },
        toNode: () => ({ type: "matcher" as const, name: "test", args: [] }),
      }),
    };
    const contextFor = createSegmentEvaluator(
      schema,
      segments,
      operators,
      {},
      {},
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    let called = false;
    const fallback = async (errors: Error[]) => {
      called = true;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors[0]).toBeInstanceOf(Error);
      return false;
    };
    const match = await result.matches("test", fallback);
    expect(match).toBe(false);
    expect(called).toBe(true);
  });

  it("returns false if fallback callback throws", async () => {
    const schema = {
      "~standard": { validate: (input: unknown) => ({ value: input }) },
    } as Schema;
    const operators: LogicalOperators<Record<string, unknown>> = {
      and: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      or: (...matchers) =>
        matchers[0] ?? ({} as MatcherDefinition<Record<string, unknown>>),
      not: (matcher) => matcher,
    };
    const segments = {
      test: () => ({
        _evaluateInternal: () => {
          throw new Error("fail");
        },
        toNode: () => ({ type: "matcher" as const, name: "test", args: [] }),
      }),
    };
    const contextFor = createSegmentEvaluator(
      schema,
      segments,
      operators,
      {},
      {},
      TestLogger,
      getNoopTracer()
    );
    const result = await contextFor({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const fallback = () => {
      throw new Error("fallback fail");
    };
    const match = await result.matches("test", fallback);
    expect(match).toBe(false);
  });
});
