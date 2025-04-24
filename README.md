# Tenon-ts

In woodworking, a tenon is a projection shaped to fit perfectly into a matching cavity, creating strong, seamless joints. **Tenon-ts** borrows this idea: just as tenons join wood segments with precision, this library helps you define, match, and compose user segments with type safety and flexibility—so your logic fits together cleanly, building robust systems without gaps or wobbles.

## Usage

### 1. Define a Schema with any [StandardSchema](https://github.com/standard-schema/standard-schema) compliant library (examples use [valibot](https://valibot.dev/))

```typescript
import { object, string, number, optional } from "valibot";

const schema = object({
  userId: string(),
  country: optional(string()),
  age: optional(number()),
  subscription: optional(string()),
});
```

### 2. Define Matchers (with or without arguments)

```typescript


const matchers = {

  isFromCountry: createMatcher({
    arguments: string(),
    evaluate: (params, args) => args.country === params.country,
  }),
  isAdult: createMatcher({
    evaluate: (params) =>
      typeof params.age === "number" && params.age >= 18,
  })
});

```

### 3. Combine matchers to create segments to match your subjects against

```typescript
const segments = {
  // Segments can be simple
  adult: async (_, __, { isAdult }) => {
    return isAdult();
  },
  // Use logical operators to combine
  usAdult: async (_, { and }, { isFromCountry, isAdult }) => {
    return and(isFromCountry("US"), isAdult());
  },
  // They can get quite complicated if required
  usChildOrNonAmericanAdult: async (
    _params,
    { or, and, not },
    { isFromCountry, isAdult }
  ) => {
    return or(
      and(isFromCountry("US"), not(isAdult())),
      and(not(isFromCountry("US")), isAdult())
    );
  },
};
```

### 4. All together

```typescript
const schema = object({
  userId: string(),
  country: optional(string()),
  age: optional(number()),
  subscription: optional(string()),
  createdAt: date(),
});

const instance = createSegmentBuilder(schema)
  .matchers((createMatcher) => ({
    isFromCountry: createMatcher({
      arguments: string(),
      evaluate: (params, country) => params.country === country,
    }),
    createdAfter: createMatcher({
      arguments: date(),
      evaluate: (params, dateArg) => {
        return params.createdAt > dateArg;
      },
    }),
    isAdult: createMatcher({
      evaluate: (params) => {
        return typeof params.age === "number" && params.age >= 18;
      },
    }),
  }))
  .segments({
    newUser: async (_params, { and }, { isFromCountry, createdAfter }) => {
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
      return and(
        isFromCountry("US"),
        createdAfter(new Date(Date.now() - ONE_WEEK))
      );
    },
    usAdult: async (_params, { and }, { isFromCountry, isAdult }) => {
      return and(isFromCountry("US"), isAdult());
    },
    usChildOrNonAmericanAdult: async (
      _params,
      { or, and, not },
      { isFromCountry, isAdult }
    ) => {
      return or(
        and(isFromCountry("US"), isAdult()),
        and(not(isFromCountry("US")), isAdult())
      );
    },
  });
```

### 5. Evaluate Segments

```typescript
const subject = UserFromApi();
const [errors, context] = await instance.contextFor(subject);

if (errors) {
  // handle validation errors on subject
  console.error(errors);
} else {
  const isAdult = await context.matches("adult");
  const isUsAdult = await context.matches("usAdult");
}
```

## Advanced Features

### Asynchronous Matchers

Matchers can perform async work

```typescript
const matchers = {
  slowMatcher: () =>
    createMatcher({
      evaluate: async (params: Params) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return params.age >= 18;
      },
    }),
};
```

### Result Caching

```typescript
const segments = {
  cacheTest: async (params, { and }, { cachedMatcher }) => {
    return and(cachedMatcher(), cachedMatcher()); // Only evaluates once
  },
};
```

### Type Safety

- All input to `contextFor` is type-checked against your schema.
- All matcher and segment definitions are fully type-safe.
- If you pass the wrong shape to `contextFor`, TypeScript will catch it at compile time.

---

For more, see the tests in `test/core.test.ts` for real-world usage patterns and advanced examples.

## Features

- **Type-Safe Parameter Definitions**: Define required and optional parameters with TypeScript types
- **Flexible Matcher System**: Create custom matchers with synchronous or asynchronous evaluation
- **Logical Operators**: Combine matchers using `and`, `or`, and `not` operators
- **Performance Optimized**: Built-in caching and parallel execution of matchers
- **Composable Segments**: Define complex user segments by combining multiple matchers

## Installation

```bash
npm install tenon-ts
# or
yarn add tenon-ts
# or
pnpm add tenon-ts
```

## Core Concepts

### Parameters

Define required and optional parameters for your segments:

```typescript
const requiredParams = {
  userId: "string",
} as const;

const optionalParams = {
  country: "string",
  age: "number",
  subscription: "string",
} as const;
```

### Matchers

Create custom matchers to evaluate specific conditions:

```typescript
const matchers = {
  isFromCountry: (country: string) =>
    createMatcher(
      (params) => params.country === country,
      () => ({ type: "matcher", name: "isFromCountry", args: [country] })
    ),
  ageGreaterThan: (age: number) =>
    createMatcher(
      (params) => params.age >= age,
      () => ({ type: "matcher", name: "ageGreaterThan", args: [age] })
    ),
};
```

### Segments

Define segments by combining matchers using logical operators:

```typescript
const segments = {
  adult: async (params, { and }, { ageGreaterThan }) => {
    return ageGreaterThan(18);
  },
  usAdult: async (params, { and }, { isFromCountry, ageGreaterThan }) => {
    return and(isFromCountry("US"), ageGreaterThan(18));
  },
};
```

### Usage

Create a segment builder instance and evaluate segments:

```typescript
const instance = createSegmentBuilder({
  schema, // your StandardSchemaV1-compatible schema
  matchers,
  segments,
});

const [errors, context] = await instance.contextFor({
  userId: "user-123",
  age: 25,
  country: "US",
});

if (errors) {
  // handle validation errors
  console.error(errors);
} else {
  const isAdult = await context.matches("adult");
  const isUsAdult = await context.matches("usAdult");
}
```

## Performance Considerations

- Matchers are executed in parallel when possible
- Results are cached to avoid redundant evaluations
- Logical operators short-circuit when possible
- Asynchronous operations are handled efficiently

## License

MIT
