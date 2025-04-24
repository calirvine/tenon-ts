import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ResultAsync } from "neverthrow";

// Matcher Types
// -------------

/**
 * Context object passed to matcher evaluate functions (with argument).
 */
export type MatcherEvaluateContextWithArg<TParams, TArg> = {
  params: TParams;
  arg?: TArg;
  cache: MatcherCache;
};

/**
 * Context object passed to matcher evaluate functions (no argument).
 */
export type MatcherEvaluateContextNoArg<TParams> = {
  params: TParams;
  cache: MatcherCache;
};

/**
 * AST node representing a matcher or logical operation for introspection/debugging.
 */
export type MatcherNode =
  | {
      type: "matcher";
      name: string;
      args: unknown[];
    }
  | {
      type: "and" | "or";
      children: MatcherNode[];
    }
  | {
      type: "not";
      child: MatcherNode;
    };

/**
 * Cache for matcher evaluation results, keyed by matcher and arguments.
 */
export type MatcherCache = Map<string, ResultAsync<boolean, Error>>;

/**
 * A matcher definition: encapsulates evaluation logic and AST node conversion.
 */
export type MatcherDefinition<TParams extends Record<string, unknown>> = {
  toNode: () => MatcherNode;
  _evaluateInternal: (context: {
    params: TParams;
    arg: unknown;
    cache: MatcherCache;
    segmentName?: string;
    batchContext?: Record<string, unknown[]>;
  }) => ResultAsync<boolean, Error>;
};

/**
 * Schema type for the subject being matched (from StandardSchema).
 */
export type Schema = StandardSchemaV1;

/**
 * The inferred output type for a given schema, with additional properties allowed.
 */
export type Subject<T extends Schema> = StandardSchemaV1.InferOutput<T> &
  Record<string, unknown>;

/**
 * The inferred input type for a given schema.
 */
export type Input<T extends Schema> = StandardSchemaV1.InferInput<T>;

/**
 * Type alias for a map of matcher objects keyed by string.
 */
export type MatcherMap<TSubject extends Record<string, unknown>> = Record<
  string,
  MatcherObject<TSubject, unknown>
>;

/**
 * Type alias for matcher argument inference from a schema.
 */
export type MatcherArgs<TSchema> =
  TSchema extends StandardSchemaV1<unknown, unknown>
    ? StandardSchemaV1.InferInput<TSchema>
    : never;

/**
 * A matcher object, parameterized by subject and (optionally) argument schema.
 * Used to define custom matchers with or without arguments.
 */
export type MatcherBatchTuple<TContext> = [TContext, (result: boolean) => void];

export type MatcherObject<
  TParams extends Record<string, unknown> = never,
  TMatcherSchema = undefined,
> =
  TMatcherSchema extends StandardSchemaV1<unknown, unknown>
    ?
        | {
            arguments: TMatcherSchema;
            evaluate: (
              context: MatcherEvaluateContextWithArg<
                TParams,
                StandardSchemaV1.InferOutput<TMatcherSchema>
              >
            ) => Promise<boolean> | boolean;
            evaluateBatch?: never;
          }
        | {
            arguments: TMatcherSchema;
            evaluate?: never;
            evaluateBatch: (
              batch: MatcherBatchTuple<
                MatcherEvaluateContextWithArg<
                  TParams,
                  StandardSchemaV1.InferOutput<TMatcherSchema>
                >
              >[]
            ) => void | Promise<void>;
          }
    :
        | {
            evaluate: (
              context: MatcherEvaluateContextNoArg<TParams>
            ) => Promise<boolean> | boolean;
            evaluateBatch?: never;
          }
        | {
            evaluate?: never;
            evaluateBatch: (
              batch: MatcherBatchTuple<MatcherEvaluateContextNoArg<TParams>>[]
            ) => void | Promise<void>;
          };

// Logical Operator Types
// ----------------------

/**
 * Logical operators for combining matcher definitions.
 */
export type LogicalOperators<TParams extends Record<string, unknown>> = {
  and: (
    ...matchers: MatcherDefinition<TParams>[]
  ) => MatcherDefinition<TParams>;
  or: (...matchers: MatcherDefinition<TParams>[]) => MatcherDefinition<TParams>;
  not: (matcher: MatcherDefinition<TParams>) => MatcherDefinition<TParams>;
};

// Segment Types
// -------------

/**
 * Context object passed to segment definition functions.
 */
export type SegmentContextObject<
  TSubject extends Record<string, unknown>,
  TMatchers extends MatcherMap<TSubject>,
> = {
  subject: TSubject;
  logicalOperators: LogicalOperators<TSubject>;
  matchers: SegmentMatchers<TSubject, TMatchers>;
};

/**
 * Mapping of matcher names to matcher factory functions, preserving argument types.
 * Uses MatcherMap for clarity.
 */
export type SegmentMatchers<
  TSubject extends Record<string, unknown>,
  TMatchers extends MatcherMap<TSubject>,
> = {
  [K in keyof TMatchers]: TMatchers[K] extends { arguments: infer TArgSchema }
    ? TArgSchema extends StandardSchemaV1<unknown, unknown>
      ? (arg: MatcherArgs<TArgSchema>) => MatcherDefinition<TSubject>
      : never
    : () => MatcherDefinition<TSubject>;
};

/**
 * A segment definition: combines matchers and logical operators to define a segment.
 * Uses MatcherMap for clarity.
 */
export type SegmentDefinition<
  TSubject extends Record<string, unknown>,
  TMatchers extends MatcherMap<TSubject>,
> = (
  context: SegmentContextObject<TSubject, TMatchers>
) => MatcherDefinition<TSubject>;

// Builder Types
// -------------

/**
 * Issue encountered during segment evaluation or schema validation.
 */
export type Issue = { message: string };

/**
 * Context for evaluating if a subject matches a segment.
 *
 * @template TSubject - The type of the subject being matched.
 * @template TSegments - The set of segment names.
 * @template TMatchers - The matcher map type.
 * @property matches - Checks if the subject matches a segment or segment definition.
 *   @param segmentName - The segment name or a segment definition callback.
 *   @param onErrorFallback - Optional callback invoked with errors if evaluation fails. Should return a boolean or Promise<boolean>.
 *     Receives an array of Error objects. Known error types: MatcherArgumentError, MatcherEvaluationError.
 *   @returns Promise resolving to true if the subject matches, false otherwise.
 */
export type SegmentContext<
  TSubject extends Record<string, unknown>,
  TSegments extends string,
  TMatchers extends MatcherMap<TSubject>,
> = {
  /**
   * Checks if the subject matches a segment or segment definition.
   *
   * @param segmentName - The segment name or a segment definition callback.
   * @param onErrorFallback - Optional callback invoked with errors if evaluation fails. Should return a boolean or Promise<boolean>.
   *   Receives an array of Error objects. Known error types: MatcherArgumentError, MatcherEvaluationError.
   * @returns Promise resolving to true if the subject matches, false otherwise.
   */
  matches: (
    segmentName:
      | TSegments
      | ((
          ctx: SegmentContextObject<TSubject, TMatchers>
        ) => MatcherDefinition<TSubject>),
    onErrorFallback?: (errors: Error[]) => boolean | Promise<boolean>
  ) => Promise<boolean>;
};

/**
 * The main builder type returned by TenonBuilder.
 * Uses MatcherMap for clarity.
 *
 * @template TSchema - The schema type for the subject.
 * @template TMatchers - The matcher map type.
 * @template TSegments - The set of segment names.
 * @template TInput - The input type for contextFor.
 * @property segments - The segment definitions.
 * @property matchers - The matcher factory functions.
 * @property contextFor - Returns a context for evaluating segments for a given input.
 *   - If validation fails: `{ ok: false, issues: Issue[] }`
 *   - If validation succeeds: `{ ok: true, matches: SegmentContext["matches"] }`
 */
export type SegmentBuilder<
  TSubject extends Record<string, unknown>,
  TMatchers extends MatcherMap<TSubject>,
  TSegments extends string,
  TInput = unknown,
> = {
  segments: Record<TSegments, SegmentDefinition<TSubject, TMatchers>>;
  matchers: SegmentMatchers<TSubject, TMatchers>;
  /**
   * Returns a context for evaluating segments for a given input.
   *
   * @param input - The input to validate and create context for.
   * @returns
   *   - If validation fails: `{ ok: false, issues: Issue[] }`
   *   - If validation succeeds: `{ ok: true, matches: SegmentContext["matches"] }`
   * @property ok - Indicates if the input was valid (`true`) or invalid (`false`).
   * @property issues - If `ok` is false, contains validation issues.
   * @property matches - If `ok` is true, a function to check segment matches.
   */
  contextFor: (input: TInput) => Promise<
    | { ok: false; issues: Issue[] }
    | {
        ok: true;
        matches: SegmentContext<TSubject, TSegments, TMatchers>["matches"];
      }
  >;
};

/**
 * Preferred ergonomic type for a Tenon segment instance.
 * Example: TenonInstance<typeof schema, typeof matchers, keyof typeof segments>
 */
export type TenonInstance<
  TSchema extends Schema,
  TMatchers extends MatcherMap<Subject<TSchema>>,
  TSegments extends string,
> = SegmentBuilder<Subject<TSchema>, TMatchers, TSegments, Input<TSchema>>;

export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  /**
   * The first argument will always be an Error (or subclass), suitable for error reporting tools.
   */
  error: (err: Error, ...args: unknown[]) => void;
}

export const noopLogger: Logger = {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
