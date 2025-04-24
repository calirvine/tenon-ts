import { ResultAsync } from "neverthrow";

import type { LogicalOperators, MatcherDefinition } from "./types";

/**
 * Creates logical operators (and, or, not) for combining matcher definitions.
 *
 * @template TSubject - The type of the subject.
 * @returns An object containing logical operator functions.
 */
export function createLogicalOperators<
  TSubject extends Record<string, unknown>,
>(): LogicalOperators<TSubject> {
  return {
    and: (...matchers: MatcherDefinition<TSubject>[]) => ({
      _evaluateInternal: (context) => {
        return ResultAsync.fromPromise(
          (async () => {
            const results = await Promise.all(
              matchers.map((m) => m._evaluateInternal(context))
            );
            for (const r of results) {
              if (r.isErr()) throw r.error;
            }
            return results.every((r) => r.unwrapOr(false));
          })(),
          (e) => (e instanceof Error ? e : new Error(String(e)))
        );
      },
      toNode: () => ({
        type: "and",
        children: matchers.map((m) => m.toNode()),
      }),
    }),
    or: (...matchers: MatcherDefinition<TSubject>[]) => ({
      _evaluateInternal: (context) => {
        return ResultAsync.fromPromise(
          (async () => {
            const results = await Promise.all(
              matchers.map((m) => m._evaluateInternal(context))
            );
            for (const r of results) {
              if (r.isErr()) throw r.error;
            }
            return results.some((r) => r.unwrapOr(false));
          })(),
          (e) => (e instanceof Error ? e : new Error(String(e)))
        );
      },
      toNode: () => ({
        type: "or",
        children: matchers.map((m) => m.toNode()),
      }),
    }),
    not: (matcher: MatcherDefinition<TSubject>) => ({
      _evaluateInternal: (context) => {
        return ResultAsync.fromPromise(
          (async () => {
            const result = await matcher._evaluateInternal(context);
            if (result.isErr()) throw result.error;
            return !result.unwrapOr(false);
          })(),
          (e) => (e instanceof Error ? e : new Error(String(e)))
        );
      },
      toNode: () => ({
        type: "not",
        child: matcher.toNode(),
      }),
    }),
  };
}
