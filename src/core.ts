import type { StandardSchemaV1 } from "@standard-schema/spec";

type MaybePromise<T> = T | Promise<T>;

type MatcherNode =
  | {
      type: "matcher";
      name: string;
      args: any[];
    }
  | {
      type: "and" | "or";
      children: MatcherNode[];
    }
  | {
      type: "not";
      child: MatcherNode;
    };

export type MatcherCache = Map<string, Promise<boolean> | boolean>;

export type MatcherDefinition<TParams extends Record<string, unknown>> = {
  evaluate: (params: TParams, cache: MatcherCache) => MaybePromise<boolean>;
  toNode: () => MatcherNode;
};

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

function makeMatcherCacheKey(
  matcherName: string,
  params: Record<string, unknown>,
  args: unknown
): string {
  return (
    matcherName +
    "|params:" +
    stableStringify(params) +
    "|args:" +
    stableStringify(args)
  );
}

// Helper to get matcher name (for debugging, not required for logic)
function getMatcherName(schema: unknown) {
  const s = schema as StandardSchemaV1<any, any>;
  return (s && s["~standard"] && s["~standard"].vendor) || "matcher";
}

// --- Type definitions needed for the new curried builder and matcher helper ---
export type Schema = StandardSchemaV1;
export type Subject<T extends Schema> = StandardSchemaV1.InferOutput<T> &
  Record<string, unknown>;
export type Input<T extends Schema> = StandardSchemaV1.InferInput<T>;

export type MatcherObject<
  TParams extends Record<string, unknown> = never,
  TMatcherSchema = undefined,
> =
  TMatcherSchema extends StandardSchemaV1<any, any>
    ? {
        arguments: TMatcherSchema;
        evaluate: (
          params: TParams,
          matcherArgs: StandardSchemaV1.InferOutput<TMatcherSchema>,
          cache: MatcherCache
        ) => MaybePromise<boolean>;
      }
    : {
        evaluate: (
          params: TParams,
          matcherArgs: never,
          cache: MatcherCache
        ) => MaybePromise<boolean>;
      };

export type LogicalOperators<TParams extends Record<string, unknown>> = {
  and: (
    ...matchers: MatcherDefinition<TParams>[]
  ) => MatcherDefinition<TParams>;
  or: (...matchers: MatcherDefinition<TParams>[]) => MatcherDefinition<TParams>;
  not: (matcher: MatcherDefinition<TParams>) => MatcherDefinition<TParams>;
};

export type SegmentMatchers<
  TSubject extends Record<string, unknown>,
  TMatchers extends Record<string, MatcherObject<TSubject, any>>,
> = {
  [K in keyof TMatchers]: TMatchers[K] extends { arguments: infer TArgSchema }
    ? TArgSchema extends StandardSchemaV1<any, any>
      ? (
          args: StandardSchemaV1.InferInput<TArgSchema>
        ) => MatcherDefinition<TSubject>
      : never
    : () => MatcherDefinition<TSubject>;
};

export type SegmentDefinition<
  TSubject extends Record<string, unknown>,
  TMatchers extends Record<string, MatcherObject<TSubject, any>>,
> = (
  subject: TSubject,
  logicalOperators: LogicalOperators<TSubject>,
  matchers: SegmentMatchers<TSubject, TMatchers>
) => Promise<MatcherDefinition<TSubject>>;

export type SegmentContext<
  TSubject extends Record<string, unknown>,
  TSegments extends string,
> = {
  matches: ((segmentName: TSegments) => Promise<boolean>) &
    ((
      segmentFn: (subject: TSubject) => Promise<boolean> | boolean
    ) => Promise<boolean>);
};

export type SegmentBuilder<
  TSubject extends Record<string, unknown>,
  TMatchers extends Record<string, MatcherObject<TSubject, any>>,
  TSegments extends string,
  TInput = unknown,
> = {
  segments: Record<TSegments, SegmentDefinition<TSubject, TMatchers>>;
  matchers: SegmentMatchers<TSubject, TMatchers>;
  contextFor: (
    input: TInput
  ) => Promise<
    [
      undefined | StandardSchemaV1.Issue[],
      undefined | SegmentContext<TSubject, TSegments>,
    ]
  >;
};

// --- Contextual createMatcher for best-of-both-worlds inference ---
function makeCreateMatcher<TSubject extends Record<string, unknown>>() {
  function createMatcher<
    TMatcherSchema extends StandardSchemaV1<any, any>,
  >(config: {
    arguments: TMatcherSchema;
    evaluate: (
      params: TSubject,
      matcherArgs: StandardSchemaV1.InferOutput<TMatcherSchema>,
      cache: MatcherCache
    ) => MaybePromise<boolean>;
  }): MatcherObject<TSubject, TMatcherSchema>;

  function createMatcher(config: {
    evaluate: (params: TSubject, cache: MatcherCache) => MaybePromise<boolean>;
  }): MatcherObject<TSubject, undefined>;

  function createMatcher(config: any): any {
    return config;
  }

  return createMatcher;
}

// --- Fluent builder API ---
export function createSegmentBuilder<TSchema extends Schema>(schema: TSchema) {
  type TSubject = Subject<TSchema>;

  // Step 1: .matchers(callback)
  function matchers<
    TMatchers extends Record<string, MatcherObject<TSubject, any>>,
  >(
    matcherCb: (
      createMatcher: ReturnType<typeof makeCreateMatcher<TSubject>>
    ) => TMatchers
  ) {
    const createMatcher = makeCreateMatcher<TSubject>();
    const matchers = matcherCb(createMatcher);

    // Step 2: .segments(segmentsObj)
    function segments<TSegments extends string = string>(
      segmentsObj: Record<TSegments, SegmentDefinition<TSubject, TMatchers>>
    ): SegmentBuilder<TSubject, TMatchers, TSegments, Input<TSchema>> {
      // Build wrappedMatchers in a type-safe way so SegmentMatchers preserves argument types
      const wrappedMatchers = {} as SegmentMatchers<TSubject, TMatchers>;
      for (const name in matchers) {
        const matcherObj = matchers[name];
        if (!matcherObj) continue;
        if ("arguments" in matcherObj && matcherObj.arguments) {
          const matcherSchema = matcherObj.arguments;
          (wrappedMatchers as any)[name] = (matcherArgs: any) => ({
            evaluate: async (params: TSubject, cache: MatcherCache) => {
              const key = makeMatcherCacheKey(
                getMatcherName(matcherSchema),
                params,
                matcherArgs
              );
              if (cache.has(key)) return cache.get(key)!;
              const result = matcherSchema["~standard"].validate(matcherArgs);
              if ("issues" in result && result.issues) {
                throw new Error(
                  `Matcher argument validation failed: ${result.issues.map((i: any) => i.message).join(", ")}`
                );
              }
              if (!("value" in result)) {
                throw new Error(
                  "Matcher argument schema did not return a valid value"
                );
              }
              const promise = Promise.resolve(
                matcherObj.evaluate(params, result.value as any, cache)
              );
              cache.set(key, promise);
              return promise;
            },
            toNode: () => ({
              type: "matcher" as const,
              name: getMatcherName(matcherSchema),
              args: [matcherArgs],
            }),
          });
        } else {
          (wrappedMatchers as any)[name] = () => ({
            evaluate: (params: TSubject, cache: MatcherCache) => {
              const key = makeMatcherCacheKey(name, params, undefined);
              if (cache.has(key)) return cache.get(key)!;
              const promise = Promise.resolve(
                matcherObj.evaluate(params, undefined as never, cache)
              );
              cache.set(key, promise);
              return promise;
            },
            toNode: () => ({
              type: "matcher" as const,
              name,
              args: [],
            }),
          });
        }
      }

      const matcherCache = new Map<string, MaybePromise<boolean>>();

      const operators: LogicalOperators<TSubject> = {
        and: (...matchers) => ({
          evaluate: async (subject: TSubject, cache) => {
            const results = await Promise.all(
              matchers.map((m) => m.evaluate(subject, cache))
            );
            return results.every((r: boolean) => r);
          },
          toNode: () => ({
            type: "and",
            children: matchers.map((m) => m.toNode()),
          }),
        }),
        or: (...matchers) => ({
          evaluate: async (subject: TSubject, cache) => {
            const results = await Promise.all(
              matchers.map((m) => m.evaluate(subject, cache))
            );
            return results.some((r: boolean) => r);
          },
          toNode: () => ({
            type: "or",
            children: matchers.map((m) => m.toNode()),
          }),
        }),
        not: (matcher) => ({
          evaluate: async (subject: TSubject, cache) => {
            const result = await matcher.evaluate(subject, cache);
            return !result;
          },
          toNode: () => ({
            type: "not",
            child: matcher.toNode(),
          }),
        }),
      };

      const builder: SegmentBuilder<
        TSubject,
        TMatchers,
        TSegments,
        Input<TSchema>
      > = {
        segments: segmentsObj,
        matchers: wrappedMatchers,
        contextFor: async (input: Input<TSchema>) => {
          const result = await schema["~standard"].validate(input);
          if ("issues" in result && result.issues) {
            return [Array.from(result.issues), undefined];
          }
          function isRecord(val: unknown): val is Record<string, unknown> {
            return typeof val === "object" && val !== null;
          }
          if (!("value" in result) || !isRecord(result.value)) {
            return [
              [
                {
                  message:
                    "Schema validation did not return a valid subject object",
                },
              ],
              undefined,
            ];
          }
          const subject = result.value as TSubject;
          const context: SegmentContext<TSubject, TSegments> = {
            matches: async (
              segmentNameOrFn:
                | TSegments
                | ((subject: TSubject) => Promise<boolean> | boolean)
            ) => {
              if (typeof segmentNameOrFn === "function") {
                return segmentNameOrFn(subject);
              }
              const segmentName = segmentNameOrFn;
              const segmentDefinition = segmentsObj[segmentName];
              if (!segmentDefinition) {
                throw new Error(`Segment ${segmentName} not found`);
              }
              const matcherCache: MatcherCache = new Map();
              const matcherDefinition = await segmentDefinition(
                subject,
                operators,
                wrappedMatchers as unknown as SegmentMatchers<
                  TSubject,
                  TMatchers
                >
              );
              return matcherDefinition.evaluate(subject, matcherCache);
            },
          };
          return [undefined, context];
        },
      };
      return builder;
    }
    return { segments };
  }
  return { matchers };
}

// --- matcher helper for full type inference ---
export function matcher<
  TMatcherSchema extends StandardSchemaV1<any, any>,
>(config: {
  arguments: TMatcherSchema;
  evaluate: <TParams extends Record<string, unknown>>(
    params: TParams,
    matcherArgs: StandardSchemaV1.InferOutput<TMatcherSchema>,
    cache: MatcherCache
  ) => MaybePromise<boolean>;
}): MatcherObject<any, TMatcherSchema> {
  return config as MatcherObject<any, TMatcherSchema>;
}
