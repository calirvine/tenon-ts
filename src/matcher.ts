import type { MatcherObject, MatcherCache, MatcherNode } from "./types";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Creates a matcher factory for the given subject type.
 *
 * @template TSubject - The type of the subject.
 * @returns A function to create matchers with or without argument schemas.
 */
export function makeCreateMatcher<TSubject extends Record<string, unknown>>() {
  /**
   * Creates a matcher with an argument schema.
   *
   * @template TMatcherSchema - The schema for matcher arguments.
   * @param config - Configuration object with arguments schema and evaluate function.
   * @returns A matcher object with argument schema.
   */
  function createMatcher<
    TMatcherSchema extends StandardSchemaV1<unknown, unknown>,
  >(config: {
    arguments: TMatcherSchema;
    evaluate?: (context: {
      params: TSubject;
      arg: StandardSchemaV1.InferOutput<TMatcherSchema>;
    }) => Promise<boolean> | boolean;
    evaluateBatch?: (
      batch: [
        {
          params: TSubject;
          arg: StandardSchemaV1.InferOutput<TMatcherSchema>;
          cache: MatcherCache;
        },
        (result: boolean) => void,
      ][]
    ) => void | Promise<void>;
    toNode?: () => MatcherNode;
  }): MatcherObject<TSubject, TMatcherSchema>;

  /**
   * Creates a matcher without an argument schema.
   *
   * @param config - Configuration object with evaluate function.
   * @returns A matcher object without argument schema.
   */
  function createMatcher(config: {
    evaluate?: (context: { params: TSubject }) => Promise<boolean> | boolean;
    evaluateBatch?: (
      batch: [
        { params: TSubject; cache: MatcherCache },
        (result: boolean) => void,
      ][]
    ) => void | Promise<void>;
    toNode?: () => MatcherNode;
  }): MatcherObject<TSubject, undefined>;

  /**
   * Internal matcher creation implementation.
   *
   * @param config - Matcher configuration.
   * @returns Matcher object with internal evaluation logic.
   */
  function createMatcher(config: unknown): unknown {
    const cfg = config as Record<string, unknown>;
    // If both evaluate and evaluateBatch are provided, default to evaluateBatch
    if (cfg.evaluate && cfg.evaluateBatch) {
      // Remove evaluate, keep evaluateBatch
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { evaluate, ...rest } = cfg;
      return {
        ...rest,
      };
    }
    return {
      ...cfg,
    };
  }

  return createMatcher;
}
