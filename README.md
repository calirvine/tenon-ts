# Tenon-ts

In woodworking, a tenon is a projection shaped to fit perfectly into a matching cavity, creating strong, seamless joints. **Tenon-ts** borrows this idea: just as tenons join wood segments with precision, this library helps you define, match, and compose user segments with type safety and flexibility—so your logic fits together cleanly, building robust systems without gaps or wobbles.

> **Note:** tenon-ts is ESM-only and does not support CommonJS (`require`). If you need to use tenon-ts from a CommonJS environment, use dynamic `import()` or migrate your project to ESM. Example:
>
> ```js
> // In CommonJS
> (async () => {
>   const { TenonBuilder } = await import("tenon-ts");
>   // ...
> })();
> ```

## Quick Start

```typescript
import { TenonBuilder } from "tenon-ts";
import { object, string, number, optional } from "valibot";

const subjectSchema = object({
  userId: string(),
  country: optional(string()),
  age: optional(number()),
  subscription: optional(string()),
});

const instance = new TenonBuilder(subjectSchema)
  .matchers((createMatcher) => ({
    isFromCountry: createMatcher({
      arguments: object({ country: string() }),
      evaluate: ({ params, arg }) => arg.country === params.country,
    }),
    isAdult: createMatcher({
      evaluate: ({ params }) =>
        typeof params.age === "number" && params.age >= 18,
    }),
  }))
  .segments({
    adult: ({ matchers }) => matchers.isAdult(),
    usAdult: ({ logicalOperators, matchers }) =>
      logicalOperators.and(
        matchers.isFromCountry({ country: "US" }),
        matchers.isAdult()
      ),
  });

const result = await instance.contextFor({
  userId: "abc",
  age: 20,
  country: "US",
});
if (!result.ok) {
  console.error(result.issues);
} else {
  const isUsAdult = await result.matches("usAdult");
  // ...
}
```

## Defining Schemas

Use any [StandardSchema](https://github.com/standard-schema/standard-schema)-compliant library. Example with [valibot](https://valibot.dev/):

```typescript
import { object, string, number, optional } from "valibot";

const subjectSchema = object({
  userId: string(),
  country: optional(string()),
  age: optional(number()),
  subscription: optional(string()),
});
```

## Creating Matchers

Matchers encapsulate reusable logic. You can define matchers with or without arguments:

```typescript
const instance = new TenonBuilder(subjectSchema).matchers((createMatcher) => ({
  // Matcher with arguments (single evaluation)
  isFromCountry: createMatcher({
    arguments: object({ country: string() }),
    evaluate: ({ params, arg }) => arg.country === params.country,
  }),
  // Matcher with arguments (batch evaluation)
  isFromCountryBatch: createMatcher({
    arguments: object({ country: string() }),
    evaluateBatch: (contexts) =>
      contexts.map(({ params, arg }) => arg.country === params.country),
  }),
  // Matcher without arguments (single evaluation)
  isAdult: createMatcher({
    evaluate: ({ params }) =>
      typeof params.age === "number" && params.age >= 18,
  }),
}));
```

- The `arguments` property must be a StandardSchema schema if your matcher takes arguments.
- The `evaluate` function receives `{ params, arg? }`.
- The `evaluateBatch` function receives an array of tuples `[args, resolve]` and must call resolve with a boolean for each value of args.
- **You must provide either `evaluate` or `evaluateBatch`, but never both.**

## Composing Segments

Segments combine matchers and logical operators. Each segment is a function receiving a context object:

```typescript
const instance = new TenonBuilder(subjectSchema)
  .matchers((createMatcher) => ({
    isFromCountry: createMatcher({
      arguments: object({ country: string() }),
      evaluate: ({ params, arg }) => arg.country === params.country,
    }),
    isAdult: createMatcher({
      evaluate: ({ params }) =>
        typeof params.age === "number" && params.age >= 18,
    }),
  }))
  .segments({
    adult: ({ matchers }) => matchers.isAdult(),
    usAdult: ({ logicalOperators, matchers }) =>
      logicalOperators.and(
        matchers.isFromCountry({ country: "US" }),
        matchers.isAdult()
      ),
    usChildOrNonAmericanAdult: ({ logicalOperators, matchers }) =>
      logicalOperators.or(
        logicalOperators.and(
          matchers.isFromCountry({ country: "US" }),
          logicalOperators.not(matchers.isAdult())
        ),
        logicalOperators.and(
          logicalOperators.not(matchers.isFromCountry({ country: "US" })),
          matchers.isAdult()
        )
      ),
  });
```

## Evaluating Segments

Use `contextFor(input)` to validate and prepare a subject for evaluation:

```typescript
const result = await instance.contextFor({
  userId: "abc",
  age: 20,
  country: "US",
});
if (!result.ok) {
  // Handle validation errors
  throw new Error(`Subject didn't match schema: ${result.issues}`);
}

const isAdult = await result.matches("adult");
const isUsAdult = await result.matches("usAdult");
```

## Advanced Features

### Asynchronous Matchers

Matchers can be async:

```typescript
const instance = new TenonBuilder(subjectSchema).matchers((createMatcher) => ({
  slowMatcher: createMatcher({
    evaluate: async ({ params }) => {
      const minAgeForFeature = await getMinAgeForFeature();
      return params.age >= minAgeForFeature;
    },
  }),
}));
```

### Result Caching

Repeated matcher calls with the same arguments are cached within a segment evaluation:

```typescript
const instance = new TenonBuilder(subjectSchema)
  .matchers((createMatcher) => ({
    cachedMatcher: createMatcher({
      evaluate: ({ params }) => {
        // ...expensive computation...
        return true;
      },
    }),
  }))
  .segments({
    cacheTest: ({ logicalOperators, matchers }) =>
      logicalOperators.and(matchers.cachedMatcher(), matchers.cachedMatcher()),
  });
```

This caching is especially useful in complicated segments where the same matcher (with the same arguments) might be used multiple times, either directly or nested within logical operators. Without caching, each invocation would re-run the matcher logic, which could be inefficient or even incorrect if the matcher is expensive, asynchronous, or has side effects. Caching ensures each matcher is only evaluated once per segment evaluation, making complex segment logic both efficient and reliable.

#### Example: Complicated Segment with Caching

Suppose you want to define a segment for a "high value" user. You have a matcher `hasRecentPurchase` that checks if the user has made a purchase in the last 30 days (which could be an expensive or async operation). You want to consider a user high value if they:

- Have made a recent purchase and are an adult, OR
- Have made a recent purchase and have a premium subscription, OR
- Are an adult and have both a premium subscription and a recent purchase

This results in a segment where `hasRecentPurchase()` is used in multiple, nested logical branches:

```typescript
const instance = new TenonBuilder(subjectSchema)
  .matchers((createMatcher) => ({
    isAdult: createMatcher({
      evaluate: ({ params }) =>
        typeof params.age === "number" && params.age >= 18,
    }),
    isPremium: createMatcher({
      evaluate: ({ params }) => params.subscription === "premium",
    }),
    hasRecentPurchase: createMatcher({
      arguments: v.date(),
      evaluate: async ({ params, arg: purchasedSinceDate }) => {
        const [lastPurchase] = await getPurchases({ order: "DESC", limit: 1 });
        return Boolean(
          lastPurchase?.date && lastPurchase.date >= purchasedSinceDate
        );
      },
    }),
  }))
  .segments({
    highValueUser: ({ logicalOperators, matchers }) =>
      logicalOperators.or(
        logicalOperators.and(matchers.hasRecentPurchase(), matchers.isAdult()),
        logicalOperators.and(
          matchers.hasRecentPurchase(),
          matchers.isPremium()
        ),
        logicalOperators.and(
          matchers.isAdult(),
          matchers.isPremium(),
          matchers.hasRecentPurchase()
        )
      ),
  });
```

In this example, `hasRecentPurchase()` is called three times within the same segment evaluation, in different logical branches. Thanks to result caching, the expensive check is only performed once per subject, even though the matcher is referenced multiple times in the segment logic.

### Type Safety

- All input to `contextFor` is type-checked against your schema at compile time.
- All matcher and segment definitions are fully type-safe.
- If you pass the wrong shape to `contextFor`, TypeScript will catch it at compile time.
- At runtime, all input is validated using your StandardSchema schema, so invalid data is rejected before any matcher or segment logic runs.

## OpenTelemetry Tracing Support

tenon-ts supports OpenTelemetry tracing for segment and matcher evaluation. Tracing is fully optional and type-safe:

- If you provide a tracer (via the `tracer` config option), spans will be created for segment and matcher evaluation.
- If you set `tracer: true`, the default tracer will be used (if OpenTelemetry is installed).
- If you set `tracer: false` or do not provide a tracer, a no-op tracer is used. This is completely inert and has no side effects or performance impact.

### Example: Enabling Tracing

```typescript
import { TenonBuilder } from "tenon-ts";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("my-app");
const builder = new TenonBuilder(subjectSchema, { tracer });
```

### Example: Using the Default or a Custom Tracer

You can opt into tracing with the default tracer by passing `tracer: true`:

```typescript
const builder = new TenonBuilder(subjectSchema, { tracer: true });
```

Or provide your own custom tracer instance (for example, a mock tracer in tests or a tracer from another OpenTelemetry setup):

```typescript
const builder = new TenonBuilder(subjectSchema, { tracer: myCustomTracer });
```

If you set `tracer: false` or do not provide a tracer, tenon-ts uses a no-op tracer.

This ensures it is safe for production or test use when tracing is not desired.

## API Reference

### `new TenonBuilder(subjectSchema, config?)`

- `subjectSchema`: StandardSchema-compliant schema
- `config.logger?`: Optional logger
- Returns a builder with `.matchers()`

### `.matchers((createMatcher) => matchers)`

- `createMatcher`: Factory for defining matchers
- Returns an object with matcher definitions
- Returns an object with `.segments()`

### `.segments(segmentsObj)`

- `segmentsObj`: Record of segment functions
- Returns a builder with `.contextFor()`

### `.contextFor(input)`

- `input`: Subject to validate and evaluate
- Returns a Promise of `{ ok: true, matches }` or `{ ok: false, issues }`
- `matches(segmentName)`: Evaluates the segment for the subject

### Error Types

- **Schema validation errors**: Returned as an array of issue objects from `contextFor` if input is invalid.
- **MatcherArgumentError**: Logged if matcher arguments are invalid during `matches`.
- **MatcherEvaluationError**: Logged if a matcher's evaluate function throws or rejects during `matches`.

## Error Handling

Tenon-ts is designed so that you never need to use try/catch with its API. Errors are surfaced in a controlled, predictable way:

### `contextFor(input)`

- Returns a Promise resolving to:
  - `{ ok: true, matches }` — the input is valid and you can evaluate segments
  - `{ ok: false, issues }` — the input failed schema validation
- The only errors that can cause `{ ok: false }` are schema validation errors. These are returned as an array of issue objects describing what was invalid about the input.
- No matcher or segment errors are ever returned from `contextFor`. If the schema is valid, you always get `{ ok: true, matches }`.

### `matches(segmentName)`

- Returns a Promise resolving to a boolean:
  - `true` if the segment matches for the subject
  - `false` if the segment does not match, or if any error occurs during evaluation (including errors in user-defined matcher/segment logic, invalid matcher arguments, or if the segment does not exist)
- If an error occurs during evaluation (e.g., a matcher throws, async rejection, invalid matcher arguments, or the segment is not found), the error is logged using the provided logger (or `console.error` by default), but never thrown or surfaced to the caller.
- The error types that may be logged include:
  - `MatcherArgumentError` (invalid matcher arguments)
  - `MatcherEvaluationError` (errors thrown inside matcher evaluate functions, sync or async)
  - Any other unexpected error

### Custom Fallbacks for Segment Evaluation Errors

By default, if any error occurs during segment or matcher evaluation (e.g., a matcher throws, async rejection, invalid matcher arguments, or the segment does not exist), `matches` returns `false` and logs the error.

If you want to customize this behavior, you can provide an optional fallback callback as the second argument to `matches`. This callback will be invoked with an array of `Error` objects representing the errors that occurred during evaluation. The callback should return a boolean (or a Promise resolving to a boolean) indicating the result you want to use in case of error.

#### Example: Using a Fallback Callback

```typescript
const result = await instance.contextFor({ userId: "abc", age: 20 });
if (!result.ok) {
  // result.issues contains schema validation errors
  console.error(result.issues);
} else {
  // Provide a fallback callback to customize error handling
  const isQualified = await result.matches("someSegment", (errors) => {
    // errors is always an array of Error objects
    for (const err of errors) {
      if (err.name === "MatcherArgumentError") {
        // Special handling for argument errors
        return false;
      }
    }
    // For all other errors, default to true (or any logic you want)
    return true;
  });
  // isQualified will be the value returned by your fallback callback if an error occurs
}
```

- The fallback callback is always called with an array of `Error` objects (even if only one error occurred).
- The callback can be synchronous or asynchronous.
- If the callback itself throws or rejects, `matches` will return `false`.
- If no fallback callback is provided, the default behavior is to return `false` on error.

This allows you to customize error handling for segment evaluation in a type-safe and predictable way, without ever needing to use try/catch in your application code.

### Summary Table

| API                 | How errors are surfaced        | What errors can occur?                                          |
| ------------------- | ------------------------------ | --------------------------------------------------------------- |
| `contextFor(input)` | `{ ok: false, issues }`        | Only schema validation errors (as issue objects)                |
| `matches(name)`     | Returns `false` and logs error | MatcherArgumentError, MatcherEvaluationError, unexpected errors |

## Testing and Development

- Uses [Bun](https://bun.sh/) for development
- Run tests with:

```bash
bun run test
```

- See `test/core.test.ts` for more real-world usage and advanced examples

## Performance and Design Notes

- Matchers are executed in parallel
- Results are cached to avoid redundant evaluations
- Logical operators short-circuit when possible
- Asynchronous operations are handled efficiently

## Security

Tenon-ts does not perform any data sanitization. All input is validated against the schema you provide, but any data that passes validation is passed unsanitized to your matcher functions. This means:

- The library makes no assumptions about the source or trustworthiness of your data.
- If you use user input or other untrusted data, you are responsible for performing any necessary sanitization before passing it to tenon-ts.
- The library itself does not execute or evaluate user-provided code, but your matcher logic may do so if you implement it that way.

**Recommendation:**
If you are using user input or data from untrusted sources, sanitize it before passing it to tenon-ts. For example, if your ORM doesn't handle SQL injection:

```typescript
import { escapeSqlInjection } from "./MyCustomSanitizer";

const sanitizedInput = escapeSqlInjection(userInput);
const result = await instance.contextFor({
  ...input,
  someField: sanitizedInput,
});
```

Or, use a schema that enforces stricter validation to reject unwanted input.

## Versioning & Changelog

This project uses [changesets](https://github.com/changesets/changesets) for automated versioning and changelog management.

- To add a changeset (documenting a change for the next release):
  ```bash
  bunx changeset
  ```
- To version and update the changelog (typically in CI or before publishing):
  ```bash
  bunx changeset version
  ```
- To publish (if you use npm publish):
  ```bash
  bunx changeset publish
  ```

The `CHANGELOG.md` file is auto-generated and updated on each release. Until the first release, a stub changelog is present. See the scripts in `package.json` for convenience.

For more details, see the [changesets documentation](https://github.com/changesets/changesets).

## License

MIT
