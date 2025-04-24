import { ResultAsync, errAsync } from "neverthrow";

import { DataLoader } from "./DataLoader";
import { MatcherArgumentError, MatcherEvaluationError } from "./errors";
import { makeMatcherCacheKey, stableStringify } from "./utils";

import type {
  MatcherMap,
  SegmentMatchers,
  MatcherCache,
  MatcherEvaluateContextWithArg,
  MatcherEvaluateContextNoArg,
  MatcherDefinition,
} from "./types";
import type { StandardSchemaV1 } from "@standard-schema/spec";

export function wrapMatchers<
  TSubject extends Record<string, unknown>,
  TMatchers extends MatcherMap<TSubject>,
>(matchers: TMatchers): SegmentMatchers<TSubject, TMatchers> {
  const wrappedMatchers = {} as SegmentMatchers<TSubject, TMatchers>;

  for (const name in matchers) {
    const matcherObj = matchers[name];
    if (!matcherObj) continue;
    if ("arguments" in matcherObj && matcherObj.arguments) {
      const matcherSchema = matcherObj.arguments;
      const matcherMemo = new Map<string, MatcherDefinition<TSubject>>();
      (wrappedMatchers as unknown as Record<string, unknown>)[name] = (
        matcherArg: unknown
      ) => {
        const argKey = stableStringify(matcherArg);
        let matcher = matcherMemo.get(argKey);
        if (!matcher) {
          if (matcherObj.evaluateBatch) {
            // Use DataLoader for batch mode, parameterized by context type
            matcher = Object.freeze({
              _evaluateInternal: (context: {
                params: TSubject;
                arg: unknown;
                cache: MatcherCache;
                segmentName?: string;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                batchContext?: any;
              }) => {
                const { params, cache, segmentName, batchContext } = context;
                const key = makeMatcherCacheKey(name, matcherArg);
                if (cache.has(key)) {
                  return cache.get(key)!;
                }
                // Validate args
                const result = (matcherSchema as StandardSchemaV1)[
                  "~standard"
                ].validate(matcherArg);
                if ("issues" in result && result.issues) {
                  return errAsync(
                    new MatcherArgumentError(
                      result.issues
                        .map((i: { message: string }) => i.message)
                        .join(", "),
                      name,
                      segmentName ?? "unknown",
                      undefined,
                      undefined
                    )
                  );
                }
                if (!("value" in result)) {
                  return errAsync(
                    new MatcherArgumentError(
                      "Matcher argument schema did not return a valid value",
                      name,
                      segmentName ?? "unknown",
                      undefined,
                      undefined
                    )
                  );
                }
                if (!batchContext)
                  throw new Error(
                    "batchContext is required for batch matchers"
                  );
                const loaderKey = `${name}:${argKey}`;
                if (!batchContext[loaderKey]) {
                  const DataLoaderInstance = new DataLoader<
                    MatcherEvaluateContextWithArg<TSubject, unknown>
                  >(
                    matcherObj.evaluateBatch as (
                      batch: [
                        MatcherEvaluateContextWithArg<TSubject, unknown>,
                        (result: boolean) => void,
                      ][]
                    ) => void | Promise<void>
                  );
                  batchContext[loaderKey] = DataLoaderInstance;
                }
                const dataLoader = batchContext[loaderKey] as DataLoader<
                  MatcherEvaluateContextWithArg<TSubject, unknown>
                >;
                const contextForBatch = {
                  params,
                  arg: result.value as unknown,
                  cache,
                  segmentName,
                };
                const resultAsync = ResultAsync.fromPromise<
                  boolean,
                  MatcherEvaluationError
                >(
                  dataLoader.load(contextForBatch),
                  (e) =>
                    new MatcherEvaluationError(
                      name,
                      segmentName ?? "unknown",
                      params,
                      undefined,
                      e
                    )
                );
                cache.set(key, resultAsync);
                return resultAsync;
              },
              toNode: () => ({
                type: "matcher" as const,
                name: name,
                args: [matcherArg],
              }),
              evaluateBatch: matcherObj.evaluateBatch,
            });
          } else {
            // Single evaluate mode (as before)
            matcher = Object.freeze({
              _evaluateInternal: (context: {
                params: TSubject;
                arg: unknown;
                cache: MatcherCache;
                segmentName?: string;
                batchContext?: Record<string, unknown[]>;
              }) => {
                const { params, cache, segmentName } = context;
                const key = makeMatcherCacheKey(name, matcherArg);
                if (cache.has(key)) {
                  return cache.get(key)!;
                }
                const result = (matcherSchema as StandardSchemaV1)[
                  "~standard"
                ].validate(matcherArg);
                if ("issues" in result && result.issues) {
                  return errAsync(
                    new MatcherArgumentError(
                      result.issues
                        .map((i: { message: string }) => i.message)
                        .join(", "),
                      name,
                      segmentName ?? "unknown",
                      undefined,
                      undefined
                    )
                  );
                }
                if (!("value" in result)) {
                  return errAsync(
                    new MatcherArgumentError(
                      "Matcher argument schema did not return a valid value",
                      name,
                      segmentName ?? "unknown",
                      undefined,
                      undefined
                    )
                  );
                }
                const contextForEval = {
                  params,
                  arg: result.value as unknown,
                  cache,
                  segmentName,
                };
                try {
                  let resultAsync: ReturnType<
                    typeof ResultAsync.fromPromise<
                      boolean,
                      MatcherEvaluationError
                    >
                  >;
                  if (typeof matcherObj.evaluate === "function") {
                    resultAsync = ResultAsync.fromPromise<
                      boolean,
                      MatcherEvaluationError
                    >(
                      Promise.resolve(matcherObj.evaluate(contextForEval)),
                      (e) =>
                        new MatcherEvaluationError(
                          name,
                          contextForEval.segmentName ?? "unknown",
                          contextForEval.params,
                          undefined,
                          e
                        )
                    );
                  } else {
                    throw new Error(
                      "Matcher object does not have an evaluate function"
                    );
                  }
                  cache.set(key, resultAsync);
                  return resultAsync;
                } catch (e) {
                  return errAsync(
                    new MatcherEvaluationError(
                      name,
                      contextForEval.segmentName ?? "unknown",
                      contextForEval.params,
                      undefined,
                      e
                    )
                  );
                }
              },
              toNode: () => ({
                type: "matcher" as const,
                name: name,
                args: [matcherArg],
              }),
            });
          }
          matcherMemo.set(argKey, matcher);
        }
        return matcher;
      };
    } else {
      let matcher:
        | (MatcherDefinition<TSubject> & { evaluateBatch?: Function })
        | undefined = undefined;
      (wrappedMatchers as unknown as Record<string, unknown>)[name] = () => {
        if (matcher) return matcher;
        if (matcherObj.evaluateBatch) {
          // Use DataLoader for batch mode (no-arg), parameterized by context type
          matcher = {
            _evaluateInternal: (context: {
              params: TSubject;
              cache: MatcherCache;
              segmentName?: string;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              batchContext?: any;
            }) => {
              const { params, cache, segmentName, batchContext } = context;
              const key = makeMatcherCacheKey(name, undefined);
              if (cache.has(key)) {
                return cache.get(key)!;
              }
              if (!batchContext)
                throw new Error("batchContext is required for batch matchers");
              const loaderKey = `${name}`;
              if (!batchContext[loaderKey]) {
                const DataLoaderInstance = new DataLoader<
                  MatcherEvaluateContextNoArg<TSubject>
                >(
                  matcherObj.evaluateBatch as (
                    batch: [
                      MatcherEvaluateContextNoArg<TSubject>,
                      (result: boolean) => void,
                    ][]
                  ) => void | Promise<void>
                );
                batchContext[loaderKey] = DataLoaderInstance;
              }
              const dataLoader = batchContext[loaderKey] as DataLoader<
                MatcherEvaluateContextNoArg<TSubject>
              >;
              const contextForBatch = { params, cache, segmentName };
              const resultAsync = ResultAsync.fromPromise<
                boolean,
                MatcherEvaluationError
              >(
                dataLoader.load(contextForBatch),
                (e) =>
                  new MatcherEvaluationError(
                    name,
                    segmentName ?? "unknown",
                    params,
                    undefined,
                    e
                  )
              );
              cache.set(key, resultAsync);
              return resultAsync;
            },
            toNode: () => ({
              type: "matcher" as const,
              name: name,
              args: [],
            }),
            evaluateBatch: matcherObj.evaluateBatch,
          };
        } else {
          matcher = {
            _evaluateInternal: (context: {
              params: TSubject;
              cache: MatcherCache;
              segmentName?: string;
              batchContext?: Record<string, unknown[]>;
            }) => {
              const { params, cache, segmentName } = context;
              const key = makeMatcherCacheKey(name, undefined);
              if (cache.has(key)) {
                return cache.get(key)!;
              }
              const contextForEval = { params, cache, segmentName };
              try {
                let resultAsync: ReturnType<
                  typeof ResultAsync.fromPromise<
                    boolean,
                    MatcherEvaluationError
                  >
                >;
                if (typeof matcherObj.evaluate === "function") {
                  resultAsync = ResultAsync.fromPromise<
                    boolean,
                    MatcherEvaluationError
                  >(
                    Promise.resolve(matcherObj.evaluate(contextForEval)),
                    (e) =>
                      new MatcherEvaluationError(
                        name,
                        contextForEval.segmentName ?? "unknown",
                        contextForEval.params,
                        undefined,
                        e
                      )
                  );
                } else {
                  throw new Error(
                    "Matcher object does not have an evaluate function"
                  );
                }
                cache.set(key, resultAsync);
                return resultAsync;
              } catch (e) {
                return errAsync(
                  new MatcherEvaluationError(
                    name,
                    contextForEval.segmentName ?? "unknown",
                    contextForEval.params,
                    undefined,
                    e
                  )
                );
              }
            },
            toNode: () => ({
              type: "matcher" as const,
              name: name,
              args: [],
            }),
            evaluateBatch: matcherObj.evaluateBatch,
          };
        }
        return matcher;
      };
    }
  }
  return wrappedMatchers;
}

// Helper to flush all local batch queues
export async function flushAllBatchQueues(
  batchContext: Record<string, unknown[]>,
  matchers: Record<string, unknown>
) {
  for (const name in batchContext) {
    const queue = batchContext[name];
    if (Array.isArray(queue) && queue.length > 0) {
      batchContext[name] = [];
      const matcher = matchers[name] as {
        evaluateBatch?: (batch: unknown[]) => unknown;
      };
      if (matcher && typeof matcher.evaluateBatch === "function") {
        try {
          await Promise.resolve(matcher.evaluateBatch(queue));
        } catch {
          for (const [, resolve] of queue as [
            unknown,
            (result: boolean) => void,
          ][]) {
            resolve(false);
          }
        }
      }
    }
  }
}
