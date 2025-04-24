import { describe, it, expect } from "vitest";

import {
  getTracer,
  getNoopTracer,
  resolveTracer,
  type OtelTracer,
} from "../src/internal/otel";

describe("otel.ts edge cases", () => {
  it("getNoopTracer returns singleton", () => {
    const t1 = getNoopTracer();
    const t2 = getNoopTracer();
    expect(t1).toBe(t2);
  });

  it("resolveTracer returns correct tracer for all branches", () => {
    const noop = getNoopTracer();
    const custom: OtelTracer = {
      startSpan: () => ({
        end: () => {},
        setAttribute: () => {},
        setStatus: () => {},
      }),
    };
    expect(resolveTracer(undefined)).toBe(noop);
    expect(resolveTracer(false)).toBe(noop);
    expect(resolveTracer(custom)).toBe(custom);
    // Can't reliably test true branch without OpenTelemetry, but should not throw
    expect(() => resolveTracer(true)).not.toThrow();
  });

  it("noop span methods do not throw", () => {
    const span = getNoopTracer().startSpan("noop");
    expect(() => {
      span.setAttribute("foo", "bar");
      span.setStatus({ code: 1, message: "fail" });
      span.end();
    }).not.toThrow();
  });

  it("getTracer falls back to noop if OpenTelemetry is unavailable", async () => {
    // Simulate OpenTelemetry not being available by temporarily replacing trace.getTracer
    const otelApi = await import("@opentelemetry/api");
    if (!otelApi.trace) {
      // If OpenTelemetry is not present, skip this test
      return;
    }
    const origTrace = otelApi.trace;
    const origGetTracer = origTrace.getTracer;
    origTrace.getTracer = () => {
      throw new Error("fail");
    };
    const tracer = getTracer();
    // Check for functional noop tracer
    expect(typeof tracer.startSpan).toBe("function");
    const span = tracer.startSpan("noop");
    expect(typeof span.end).toBe("function");
    expect(typeof span.setAttribute).toBe("function");
    expect(typeof span.setStatus).toBe("function");
    // Restore
    origTrace.getTracer = origGetTracer;
  });
});
