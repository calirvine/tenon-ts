import {
  trace,
  type SpanStatusCode,
  type AttributeValue,
  type Tracer,
  type Span as OtelApiSpan,
} from "@opentelemetry/api";

/**
 * Represents a span in OpenTelemetry tracing.
 */
export interface OtelSpan {
  /**
   * Ends the span.
   */
  end(): void;
  /**
   * Sets an attribute on the span.
   * @param key - The attribute key.
   * @param value - The attribute value.
   */
  setAttribute(key: string, value: unknown): void;
  /**
   * Sets the status of the span.
   * @param status - The status object containing code and optional message.
   */
  setStatus(status: { code: SpanStatusCode; message?: string }): void;
}

/**
 * Represents a tracer for creating spans in OpenTelemetry.
 */
export interface OtelTracer {
  /**
   * Starts a new span.
   * @param name - The name of the span.
   * @param options - Optional span options.
   * @returns An OtelSpan instance.
   */
  startSpan(name: string, options?: object): OtelSpan;
}

class NoopSpan implements OtelSpan {
  end() {}
  setAttribute(_key: string, _value: unknown) {}
  setStatus(_status: { code: SpanStatusCode; message?: string }) {}
}

class NoopTracer implements OtelTracer {
  startSpan(_name: string, _options?: object): OtelSpan {
    return new NoopSpan();
  }
}

const noopTracerInstance = new NoopTracer();

let cachedTracer: OtelTracer | null = null;

/**
 * Gets the OpenTelemetry tracer, or a noop tracer if unavailable.
 * @returns An OtelTracer instance.
 */
export function getTracer(): OtelTracer {
  if (cachedTracer) return cachedTracer;
  try {
    const tracer: Tracer = trace.getTracer("tenon-ts");
    cachedTracer = {
      startSpan(name: string, options?: object) {
        const span: OtelApiSpan = tracer.startSpan(name, options);
        return {
          end: () => span.end(),
          setAttribute: (key: string, value: unknown) =>
            span.setAttribute(key, value as AttributeValue),
          setStatus: (status: { code: SpanStatusCode; message?: string }) =>
            span.setStatus(status),
        };
      },
    };
    return cachedTracer;
  } catch {
    cachedTracer = noopTracerInstance;
    return cachedTracer;
  }
}

/**
 * Gets a noop tracer instance.
 * @returns An OtelTracer that does nothing.
 */
export function getNoopTracer(): OtelTracer {
  return noopTracerInstance;
}

/**
 * Resolves the tracer to use based on the provided option.
 * @param tracerOpt - If true, returns a real tracer; if false or undefined, returns a noop tracer; if OtelTracer, returns it directly.
 * @returns An OtelTracer instance.
 */
export function resolveTracer(
  tracerOpt: boolean | OtelTracer | undefined
): OtelTracer {
  if (tracerOpt === true) return getTracer();
  if (!tracerOpt) return getNoopTracer();
  return tracerOpt;
}
