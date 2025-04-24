import { SpanStatusCode } from "@opentelemetry/api";
import { ResultAsync } from "neverthrow";
import { describe, it, expect, vi } from "vitest";

import {
  getNoopTracer,
  type OtelTracer,
  type OtelSpan,
} from "../src/internal/otel";
import { createSegmentEvaluator } from "../src/segment";
import { noopLogger, type LogicalOperators, type Schema } from "../src/types";

class MockSpan implements OtelSpan {
  public ended = false;
  public attributes: Record<string, unknown> = {};
  constructor(public name: string) {}
  end() {
    this.ended = true;
  }
  setAttribute(key: string, value: unknown) {
    this.attributes[key] = value;
  }
  setStatus(_status: { code: SpanStatusCode; message?: string }) {}
}

class MockTracer implements OtelTracer {
  public spans: MockSpan[] = [];
  startSpan(name: string, _options?: object) {
    const span = new MockSpan(name);
    this.spans.push(span);
    return span;
  }
}

describe("OpenTelemetry tracing integration", () => {
  it("creates spans for segment and matcher evaluation", async () => {
    const tracer = new MockTracer();
    const schema = {
      "~standard": {
        type: "object",
        version: 1,
        vendor: "valibot",
        validate: (input: unknown) => ({ value: input }),
        reference: () => undefined,
        expects: "Object",
      },
    } as unknown as Schema;
    const operators = {
      and: (...matchers) => matchers[0],
      or: (...matchers) => matchers[0],
      not: (matcher) => matcher,
    } as LogicalOperators<Record<string, unknown>>;
    const wrappedMatchers = {
      alwaysTrue: () => ({
        _evaluateInternal: () =>
          ResultAsync.fromPromise(Promise.resolve(true), (e) => e as Error),
        toNode: () => ({
          type: "matcher" as const,
          name: "alwaysTrue",
          args: [] as unknown[],
        }),
      }),
    };
    const rawMatchers = {
      alwaysTrue: {
        evaluate: (_context: { params: Record<string, unknown> }) => true,
      },
    };
    const contextFor = createSegmentEvaluator(
      schema,
      {
        testSegment: ({ matchers }) => matchers.alwaysTrue(),
      },
      operators,
      wrappedMatchers,
      rawMatchers,
      noopLogger,
      tracer
    );
    const result = await contextFor({ foo: "bar" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("testSegment");
    expect(match).toBe(true);
    // Should have created a segment and matcher span
    expect(tracer.spans?.length).toBe(2);
    expect(tracer.spans?.[0]?.name).toBe("segment:testSegment");
    expect(tracer.spans?.[1]?.name).toBe("matcher:alwaysTrue");
    expect(tracer.spans?.[0]?.attributes["segment.name"]).toBe("testSegment");
    expect(tracer.spans?.[1]?.attributes["matcher.name"]).toBe("alwaysTrue");
    expect(tracer.spans?.[0]?.attributes["result"]).toBe("success");
    expect(tracer.spans?.[1]?.attributes["result"]).toBe("success");
    expect(tracer.spans?.[0]?.ended).toBe(true);
    expect(tracer.spans?.[1]?.ended).toBe(true);
  });

  it("does not create spans with the no-op tracer", async () => {
    const tracer = getNoopTracer();
    const schema = {
      "~standard": {
        type: "object",
        version: 1,
        vendor: "valibot",
        validate: (input: unknown) => ({ value: input }),
        reference: () => undefined,
        expects: "Object",
      },
    } as unknown as Schema;
    const operators = {
      and: (...matchers) => matchers[0],
      or: (...matchers) => matchers[0],
      not: (matcher) => matcher,
    } as LogicalOperators<Record<string, unknown>>;
    const wrappedMatchers = {
      alwaysTrue: () => ({
        _evaluateInternal: () =>
          ResultAsync.fromPromise(Promise.resolve(true), (e) => e as Error),
        toNode: () => ({
          type: "matcher" as const,
          name: "alwaysTrue",
          args: [] as unknown[],
        }),
      }),
    };
    const rawMatchers = {
      alwaysTrue: {
        evaluate: (_context: { params: Record<string, unknown> }) => true,
      },
    };
    const contextFor = createSegmentEvaluator(
      schema,
      {
        testSegment: ({ matchers }) => matchers.alwaysTrue(),
      },
      operators,
      wrappedMatchers,
      rawMatchers,
      noopLogger,
      tracer
    );
    const result = await contextFor({ foo: "bar" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("testSegment");
    expect(match).toBe(true);
    // No error or exception, but no spans to check
  });

  // This test ensures the no-op tracer is truly inert: its span methods do nothing and never throw.
  // This guarantees it is safe for production or test use when tracing is not desired.
  it("noop tracer span methods are no-ops", () => {
    const tracer = getNoopTracer();
    const span = tracer.startSpan("noop");
    expect(() => {
      span.setAttribute("foo", "bar");
      span.end();
    }).not.toThrow();
  });

  it("sets error status and attributes on spans when a matcher throws", async () => {
    const schema = {
      "~standard": {
        type: "object",
        version: 1,
        vendor: "valibot",
        validate: (input: unknown) => ({ value: input }),
        reference: () => undefined,
        expects: "Object",
      },
    } as unknown as Schema;

    const operators = {
      and: (...matchers) => matchers[0],
      or: (...matchers) => matchers[0],
      not: (matcher) => matcher,
    } as LogicalOperators<Record<string, unknown>>;
    const wrappedMatchers = {
      alwaysThrows: () => ({
        _evaluateInternal: () =>
          ResultAsync.fromPromise(
            Promise.reject(new Error("fail!")),
            (e) => e as Error
          ),
        toNode: () => ({
          type: "matcher" as const,
          name: "alwaysThrows",
          args: [] as unknown[],
        }),
      }),
    };
    const rawMatchers = {
      alwaysThrows: {
        evaluate: (_context: { params: Record<string, unknown> }) => {
          throw new Error("fail!");
        },
      },
    };
    // Extend MockSpan to support setStatus for this test
    class ErrorMockSpan extends MockSpan {
      public status: { code: SpanStatusCode; message?: string } | undefined;
      override setStatus(status: { code: SpanStatusCode; message?: string }) {
        this.status = status;
      }
    }
    class ErrorMockTracer extends MockTracer {
      public override spans: ErrorMockSpan[] = [];
      override startSpan(name: string, _options?: object) {
        const span = new ErrorMockSpan(name);
        this.spans.push(span);
        return span;
      }
    }
    const errorTracer = new ErrorMockTracer();
    const onError = vi.fn();
    const contextFor = createSegmentEvaluator(
      schema,
      {
        testSegment: ({ matchers }) => matchers.alwaysThrows(),
      },
      operators,
      wrappedMatchers,
      rawMatchers,
      noopLogger,
      errorTracer,
      onError
    );
    const result = await contextFor({ foo: "bar" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    const match = await result.matches("testSegment");
    expect(match).toBe(false);
    // Should have created a segment and matcher span
    expect(errorTracer.spans?.length).toBe(2);
    const [segmentSpan, matcherSpan] = errorTracer.spans;
    // Both should have error status and error attributes
    expect(segmentSpan?.status?.code).toBe(SpanStatusCode.ERROR);
    expect(segmentSpan?.status?.message).toMatch(/fail!/);
    expect(segmentSpan?.attributes["error.name"]).toBe("Error");
    expect(segmentSpan?.attributes["error.message"]).toMatch(/fail!/);
    expect(typeof segmentSpan?.attributes["error.stack"]).toBe("string");
    expect(matcherSpan?.status?.code).toBe(SpanStatusCode.ERROR);
    expect(matcherSpan?.status?.message).toMatch(/fail!/);
    expect(matcherSpan?.attributes["error.name"]).toBe("Error");
    expect(matcherSpan?.attributes["error.message"]).toMatch(/fail!/);
    expect(typeof matcherSpan?.attributes["error.stack"]).toBe("string");
    // onError should be called at least once with the error and context
    expect(onError).toHaveBeenCalled();
    const call = onError.mock.calls[0];
    expect(call).toBeDefined();
    if (call) {
      const err = call[0];
      const context = call[1];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/fail!/);
      expect(context).toMatchObject({ segmentName: "testSegment" });
    }
  });
});
