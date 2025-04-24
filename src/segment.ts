import { SpanStatusCode } from "@opentelemetry/api";
import { ResultAsync } from "neverthrow";

import { flushAllBatchQueues } from "./wrapMatchers";

import type { OtelTracer } from "./internal/otel";
import type {
  MatcherCache,
  Input,
  SegmentDefinition,
  SegmentMatchers,
  Schema,
  Logger,
  SegmentContextObject,
  MatcherDefinition,
  MatcherMap,
  LogicalOperators,
} from "./types";

const OTEL_INSTRUMENTED = Symbol("otelInstrumented");

export function createSegmentEvaluator<
  TSubject extends Record<string, unknown>,
  TMatchers extends MatcherMap<TSubject>,
  TSegments extends string,
  TSchema extends Schema,
>(
  schema: TSchema,
  segmentsObj: Record<TSegments, SegmentDefinition<TSubject, TMatchers>>,
  operators: LogicalOperators<TSubject>,
  wrappedMatchers: SegmentMatchers<TSubject, TMatchers>,
  rawMatchers: TMatchers,
  logger: Logger,
  tracer: OtelTracer,
  onError?: (err: Error, context?: unknown) => void
) {
  return async function contextFor(input: Input<TSchema>): Promise<
    | { ok: false; issues: { message: string }[] }
    | {
        ok: true;
        matches: (
          segmentNameOrFn:
            | TSegments
            | ((
                ctx: SegmentContextObject<TSubject, TMatchers>
              ) => MatcherDefinition<TSubject>),
          onErrorFallback?: (errors: Error[]) => boolean | Promise<boolean>
        ) => Promise<boolean>;
      }
  > {
    const result = await schema["~standard"].validate(input);
    if ("issues" in result && result.issues) {
      return { ok: false as const, issues: Array.from(result.issues) };
    }
    if (!("value" in result)) {
      return {
        ok: false as const,
        issues: [
          {
            message: "Schema validation did not return a valid value",
          },
        ],
      };
    }
    const subject = result.value as TSubject;
    const matches = async (
      segmentNameOrFn:
        | TSegments
        | ((
            ctx: SegmentContextObject<TSubject, TMatchers>
          ) => MatcherDefinition<TSubject>),
      onErrorFallback?: (errors: Error[]) => boolean | Promise<boolean>
    ): Promise<boolean> => {
      // Local batch context for this evaluation
      const batchContext: Record<string, unknown[]> = {};
      try {
        if (typeof segmentNameOrFn === "function") {
          // Start ad-hoc segment evaluation span
          const segmentSpan = tracer.startSpan("segment:ad-hoc");
          segmentSpan.setAttribute("segment.name", "ad-hoc");
          let resultValue: boolean;
          try {
            // Provide the full context object for ad-hoc segment functions
            const context = {
              subject,
              logicalOperators: operators,
              matchers: wrappedMatchers,
            };
            let matcherDefinition;
            try {
              matcherDefinition = segmentNameOrFn(context);
            } catch (matcherThrownErr) {
              // Synchronous throw from matcher function construction
              const err =
                matcherThrownErr instanceof Error
                  ? matcherThrownErr
                  : (() => {
                      const e = new Error(String(matcherThrownErr));
                      e.name = "Error";
                      return e;
                    })();
              logger.error(err);
              if (onError) onError(err, { subject });
              segmentSpan.setAttribute("result", "failure");
              segmentSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              segmentSpan.setAttribute("error.name", err.name);
              segmentSpan.setAttribute("error.message", err.message);
              segmentSpan.setAttribute("error.stack", err.stack ?? "");
              if (onErrorFallback) {
                try {
                  resultValue = await onErrorFallback([
                    err instanceof Error ? err : new Error(String(err)),
                  ]);
                } catch (fallbackErr) {
                  logger.error(
                    fallbackErr instanceof Error
                      ? fallbackErr
                      : new Error(String(fallbackErr))
                  );
                  resultValue = false;
                }
              } else {
                resultValue = false;
              }
              return resultValue;
            }
            const matcherCache: MatcherCache = new Map();
            const evalContext = {
              params: subject,
              arg: undefined,
              cache: matcherCache,
              segmentName: undefined,
              batchContext,
            };
            // If the matcher is a batch matcher, flush before awaiting the result
            const isBatchMatcher = !!(
              matcherDefinition &&
              typeof matcherDefinition === "object" &&
              "evaluateBatch" in matcherDefinition
            );
            let matcherResult;
            try {
              const resultPromise =
                matcherDefinition._evaluateInternal(evalContext);
              if (isBatchMatcher) {
                await flushAllBatchQueues(batchContext, wrappedMatchers);
              }
              matcherResult = await resultPromise;
              await flushAllBatchQueues(batchContext, wrappedMatchers);
            } catch (matcherThrownErr) {
              // Synchronous throw from matcher function
              const err =
                matcherThrownErr instanceof Error
                  ? matcherThrownErr
                  : (() => {
                      const e = new Error(String(matcherThrownErr));
                      e.name = "Error";
                      return e;
                    })();
              logger.error(err);
              if (onError) onError(err, { subject });
              segmentSpan.setAttribute("result", "failure");
              segmentSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              segmentSpan.setAttribute("error.name", err.name);
              segmentSpan.setAttribute("error.message", err.message);
              segmentSpan.setAttribute("error.stack", err.stack ?? "");
              if (onErrorFallback) {
                try {
                  resultValue = await onErrorFallback([
                    err instanceof Error ? err : new Error(String(err)),
                  ]);
                } catch (fallbackErr) {
                  logger.error(
                    fallbackErr instanceof Error
                      ? fallbackErr
                      : new Error(String(fallbackErr))
                  );
                  resultValue = false;
                }
              } else {
                resultValue = false;
              }
              return resultValue;
            }
            if (matcherResult.isErr()) {
              const err =
                matcherResult.error instanceof Error
                  ? matcherResult.error
                  : (() => {
                      const e = new Error(String(matcherResult.error));
                      e.name = "Error";
                      return e;
                    })();
              logger.error(err);
              if (onError) onError(err, { subject });
              segmentSpan.setAttribute("result", "failure");
              segmentSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              segmentSpan.setAttribute("error.name", err.name);
              segmentSpan.setAttribute("error.message", err.message);
              segmentSpan.setAttribute("error.stack", err.stack ?? "");
              if (onErrorFallback) {
                try {
                  resultValue = await onErrorFallback([
                    err instanceof Error ? err : new Error(String(err)),
                  ]);
                } catch (fallbackErr) {
                  logger.error(
                    fallbackErr instanceof Error
                      ? fallbackErr
                      : new Error(String(fallbackErr))
                  );
                  resultValue = false;
                }
              } else {
                resultValue = false;
              }
            } else {
              segmentSpan.setAttribute("result", "success");
              resultValue = matcherResult.unwrapOr(false);
            }
          } catch (err) {
            const errorToLog =
              err instanceof Error
                ? err
                : (() => {
                    const e = new Error(String(err));
                    e.name = "Error";
                    return e;
                  })();
            logger.error(errorToLog);
            if (onError) onError(errorToLog, { subject });
            segmentSpan.setAttribute("result", "failure");
            segmentSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: errorToLog.message,
            });
            segmentSpan.setAttribute("error.name", errorToLog.name);
            segmentSpan.setAttribute("error.message", errorToLog.message);
            segmentSpan.setAttribute("error.stack", errorToLog.stack ?? "");
            if (onErrorFallback) {
              try {
                resultValue = await onErrorFallback([
                  errorToLog instanceof Error
                    ? errorToLog
                    : new Error(String(errorToLog)),
                ]);
              } catch (fallbackErr) {
                logger.error(
                  fallbackErr instanceof Error
                    ? fallbackErr
                    : new Error(String(fallbackErr))
                );
                resultValue = false;
              }
            } else {
              resultValue = false;
            }
          } finally {
            segmentSpan.end();
          }
          return resultValue;
        }
        const segmentName = segmentNameOrFn;
        const segmentDefinition = segmentsObj[segmentName];
        if (!segmentDefinition) {
          if (onErrorFallback) {
            try {
              return await onErrorFallback([
                new Error(`Segment definition not found: ${segmentName}`),
              ]);
            } catch (fallbackErr) {
              logger.error(
                fallbackErr instanceof Error
                  ? fallbackErr
                  : new Error(String(fallbackErr))
              );
              return false;
            }
          }
          return false;
        }
        // Start segment evaluation span
        const segmentSpan = tracer.startSpan(`segment:${segmentName}`);
        segmentSpan.setAttribute("segment.name", segmentName);
        let segmentResult: boolean;
        try {
          const matcherCache: MatcherCache = new Map();
          const matcherDefinition = await segmentDefinition({
            subject,
            logicalOperators: operators,
            matchers: wrappedMatchers,
          });
          // Only patch if not already instrumented (avoid mutating frozen objects)
          let instrumentedMatcherDefinition = matcherDefinition;
          if (!(OTEL_INSTRUMENTED in matcherDefinition)) {
            instrumentedMatcherDefinition = {
              ...matcherDefinition,
              _evaluateInternal: (ctx) =>
                ResultAsync.fromPromise(
                  (async () => {
                    // Try to get matcher name from matcherDefinition.toNode()
                    let matcherName = "unknown";
                    try {
                      const node = matcherDefinition.toNode();
                      if (
                        node &&
                        typeof node === "object" &&
                        "name" in node &&
                        typeof node.name === "string"
                      ) {
                        matcherName = node.name;
                      }
                    } catch {}
                    const matcherSpan = tracer.startSpan(
                      `matcher:${matcherName}`
                    );
                    matcherSpan.setAttribute("matcher.name", matcherName);
                    try {
                      const matcherResult =
                        await matcherDefinition._evaluateInternal({
                          ...ctx,
                          batchContext,
                        });
                      matcherSpan.setAttribute(
                        "result",
                        matcherResult.isOk() ? "success" : "failure"
                      );
                      if (matcherResult.isOk()) {
                        return matcherResult.unwrapOr(false);
                      } else {
                        throw matcherResult.error;
                      }
                    } catch (err) {
                      matcherSpan.setStatus({
                        code: SpanStatusCode.ERROR,
                        message:
                          err instanceof Error ? err.message : String(err),
                      });
                      matcherSpan.setAttribute(
                        "error.name",
                        err instanceof Error ? err.name : typeof err
                      );
                      matcherSpan.setAttribute(
                        "error.message",
                        err instanceof Error ? err.message : String(err)
                      );
                      matcherSpan.setAttribute(
                        "error.stack",
                        err instanceof Error ? (err.stack ?? "") : ""
                      );
                      if (onError && err instanceof Error) {
                        onError(err, { matcherName, segmentName, subject });
                      }
                      throw err;
                    } finally {
                      matcherSpan.end();
                    }
                  })(),
                  (e) => (e instanceof Error ? e : new Error(String(e)))
                ),
            };
            Object.defineProperty(
              instrumentedMatcherDefinition,
              OTEL_INSTRUMENTED,
              { value: true }
            );
          }
          const evalContext = {
            params: subject,
            arg: undefined,
            cache: matcherCache,
            segmentName,
            batchContext,
          };
          const segmentEvalResult =
            await instrumentedMatcherDefinition._evaluateInternal(evalContext);
          await flushAllBatchQueues(batchContext, wrappedMatchers);
          if (segmentEvalResult.isErr()) {
            const err =
              segmentEvalResult.error instanceof Error
                ? segmentEvalResult.error
                : (() => {
                    const e = new Error(String(segmentEvalResult.error));
                    e.name = "Error";
                    return e;
                  })();
            logger.error(err);
            if (onError) onError(err, { segmentName, subject });
            segmentSpan.setAttribute("result", "failure");
            segmentSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            segmentSpan.setAttribute("error.name", err.name);
            segmentSpan.setAttribute("error.message", err.message);
            segmentSpan.setAttribute("error.stack", err.stack ?? "");
            if (onErrorFallback) {
              try {
                return await onErrorFallback([
                  err instanceof Error ? err : new Error(String(err)),
                ]);
              } catch (fallbackErr) {
                logger.error(
                  fallbackErr instanceof Error
                    ? fallbackErr
                    : new Error(String(fallbackErr))
                );
                return false;
              }
            }
            segmentResult = false;
          } else {
            segmentSpan.setAttribute("result", "success");
            const segmentResultValue = segmentEvalResult.unwrapOr(false);
            segmentResult = segmentResultValue;
          }
        } catch (err) {
          const errorToLog =
            err instanceof Error
              ? err
              : (() => {
                  const e = new Error(String(err));
                  e.name = "Error";
                  return e;
                })();
          logger.error(errorToLog);
          if (onError) onError(errorToLog, { segmentName, subject });
          segmentSpan.setAttribute("result", "failure");
          segmentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorToLog.message,
          });
          segmentSpan.setAttribute("error.name", errorToLog.name);
          segmentSpan.setAttribute("error.message", errorToLog.message);
          segmentSpan.setAttribute("error.stack", errorToLog.stack ?? "");
          if (onErrorFallback) {
            try {
              return await onErrorFallback([
                errorToLog instanceof Error
                  ? errorToLog
                  : new Error(String(errorToLog)),
              ]);
            } catch (fallbackErr) {
              logger.error(
                fallbackErr instanceof Error
                  ? fallbackErr
                  : new Error(String(fallbackErr))
              );
              return false;
            }
          }
          segmentResult = false;
        } finally {
          segmentSpan.end();
        }
        return segmentResult;
      } catch (err) {
        const errorToLog =
          err instanceof Error
            ? err
            : (() => {
                const e = new Error(String(err));
                e.name = "Error";
                return e;
              })();
        logger.error(errorToLog);
        if (onError) onError(errorToLog, { subject });
        if (onErrorFallback) {
          try {
            return await onErrorFallback([
              errorToLog instanceof Error
                ? errorToLog
                : new Error(String(errorToLog)),
            ]);
          } catch (fallbackErr) {
            logger.error(
              fallbackErr instanceof Error
                ? fallbackErr
                : new Error(String(fallbackErr))
            );
            return false;
          }
        }
        return false;
      }
    };
    return { ok: true as const, matches };
  };
}
