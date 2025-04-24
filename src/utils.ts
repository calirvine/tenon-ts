/**
 * Returns a stable, deterministic JSON string representation of an object.
 *
 * @param obj - The object to stringify.
 * @returns A stable stringified representation of the object.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  if (typeof obj === "object" && obj !== null) {
    const record = obj as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableStringify(record[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(obj);
}

/**
 * Creates a cache key for a matcher based on its name and arguments.
 *
 * @param matcherName - The name of the matcher.
 * @param args - The arguments for the matcher.
 * @returns A string cache key.
 */
export function makeMatcherCacheKey(
  matcherName: string,
  args: unknown
): string {
  const key = matcherName + "|args:" + stableStringify(args);
  return key;
}
