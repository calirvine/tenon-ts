import { describe, it, expect } from "vitest";
import { createSegmentBuilder } from "../src/core.js";
import { object, string, number, optional } from "valibot";
import type { StandardSchemaV1 } from "@standard-schema/spec";

describe("Tenon-ts", () => {
  it("should allow defining segments with required and optional parameters", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
      age: optional(number()),
      subscription: optional(string()),
    });
    type Params = StandardSchemaV1.InferOutput<typeof schema>;

    const instance = createSegmentBuilder(schema)
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: (params, args) => args.country === params.country,
        }),
        ageGreaterThan: createMatcher({
          arguments: object({ age: number() }),
          evaluate: (params, args) =>
            typeof params.age === "number" && params.age >= args.age,
        }),
        isPremiumUser: createMatcher({
          evaluate: (params) =>
            typeof params.userId === "string" &&
            params.userId.startsWith("premium-"),
        }),
        isAdult: createMatcher({
          evaluate: (params) =>
            typeof params.age === "number" && params.age >= 18,
        }),
      }))
      .segments({
        adult: async (_params, _operators, { ageGreaterThan }) => {
          return ageGreaterThan({ age: 18 });
        },
        premium: async (_params, _operators, { isPremiumUser }) => {
          return isPremiumUser();
        },
        canadian: async (_params, _operators, { isFromCountry }) => {
          return isFromCountry({ country: "CA" });
        },
        usAdult: async (
          _params,
          { and },
          { isFromCountry, ageGreaterThan }
        ) => {
          return and(
            isFromCountry({ country: "US" }),
            ageGreaterThan({ age: 18 })
          );
        },
        complexSegment: async (
          _params,
          { and, not },
          { isAdult, isFromCountry }
        ) => {
          return and(isAdult(), not(isFromCountry({ country: "US" })));
        },
      });

    // Test matching
    const [err1, user1Context] = await instance.contextFor({
      userId: "user-123",
      age: 25,
      country: "US",
    });
    expect(err1).toBeUndefined();
    expect(await user1Context!.matches("adult")).toBe(true);

    const [err2, user2Context] = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "CA",
    });

    expect(err2).toBeUndefined();
    expect(await user2Context!.matches("adult")).toBe(false);

    const [err3, ctx3] = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "CA",
    });

    expect(err3).toBeUndefined();
    expect(await ctx3!.matches("usAdult")).toBe(false);
    expect(await ctx3!.matches("premium")).toBe(true);

    const [err4, ctx4] = await instance.contextFor({
      userId: "123",
      age: 17,
      country: "CA",
    });
    expect(err4).toBeUndefined();
    expect(await ctx4!.matches("premium")).toBe(false);

    // Can also use generic matcher
    const [err5, ctx5] = await instance.contextFor({
      userId: "user-123",
      age: 25,
      country: "US",
    });

    expect(err5).toBeUndefined();
    expect(await ctx5!.matches("adult")).toBe(true);

    const [err6, ctx6] = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "CA",
    });
    expect(err6).toBeUndefined();
    expect(await ctx6!.matches("adult")).toBe(false);
  });

  it("should work with isFromCountry matcher", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
      age: optional(number()),
    });
    type Params = StandardSchemaV1.InferOutput<typeof schema>;
    const instance = createSegmentBuilder(schema)
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: (params, args) => args.country === params.country,
        }),
      }))
      .segments({
        canadian: async (params, { and }, { isFromCountry }) => {
          return isFromCountry({ country: "CA" });
        },
      });
    // Test with Canadian user
    const [err1, ctx1] = await instance.contextFor({
      userId: "user-123",
      country: "CA",
    });
    expect(err1).toBeUndefined();
    expect(await ctx1!.matches("canadian")).toBe(true);
    const [err2, ctx2] = await instance.contextFor({
      userId: "user-123",
      country: "US",
    });
    expect(err2).toBeUndefined();
    expect(await ctx2!.matches("canadian")).toBe(false);
    // Test with US user
    const [err3, ctx3] = await instance.contextFor({
      userId: "user-456",
      country: "US",
    });
    expect(err3).toBeUndefined();
    expect(await ctx3!.matches("canadian")).toBe(false);
    const [err4, ctx4] = await instance.contextFor({
      userId: "user-456",
      country: "CA",
    });
    expect(err4).toBeUndefined();
    expect(await ctx4!.matches("canadian")).toBe(true);
  });

  it("should work with complex matcher expressions and caching", async () => {
    const schema = object({
      userId: string(),
      country: optional(string()),
      age: optional(number()),
      subscription: optional(string()),
    });
    type Params = StandardSchemaV1.InferOutput<typeof schema>;
    const instance = createSegmentBuilder(schema)
      .matchers((createMatcher) => ({
        isFromCountry: createMatcher({
          arguments: object({ country: string() }),
          evaluate: (params, args) => args.country === params.country,
        }),
        ageGreaterThan: createMatcher({
          arguments: object({ age: number() }),
          evaluate: (params, args) =>
            typeof params.age === "number" && params.age >= args.age,
        }),
        isPremiumUser: createMatcher({
          evaluate: (params) =>
            typeof params.userId === "string" &&
            params.userId.startsWith("premium-"),
        }),
      }))
      .segments({
        complexSegment: async (
          params,
          { and, or, not },
          { isFromCountry, ageGreaterThan, isPremiumUser }
        ) => {
          return or(
            and(isFromCountry({ country: "US" }), ageGreaterThan({ age: 21 })),
            and(isPremiumUser(), not(isFromCountry({ country: "CA" })))
          );
        },
      });
    // Test complex segment with various combinations
    const [err1, ctx1] = await instance.contextFor({
      userId: "user-123",
      age: 25,
      country: "US",
    });
    expect(err1).toBeUndefined();
    expect(await ctx1!.matches("complexSegment")).toBe(true);
    const [err2, ctx2] = await instance.contextFor({
      userId: "premium-456",
      age: 17,
      country: "US",
    });
    expect(err2).toBeUndefined();
    expect(await ctx2!.matches("complexSegment")).toBe(true);
    const [err3, ctx3] = await instance.contextFor({
      userId: "user-123",
      age: 17,
      country: "CA",
    });
    expect(err3).toBeUndefined();
    expect(await ctx3!.matches("complexSegment")).toBe(false);
  });

  it("should return errors when input does not match schema", async () => {
    const schema = object({
      userId: string(),
      age: number(),
    });
    const instance = createSegmentBuilder(schema)
      .matchers((createMatcher) => ({
        isAdult: createMatcher({
          evaluate: (params: { age: number }) => params.age >= 18,
        }),
      }))
      .segments({
        adult: async (params: { age: number }, { and }, { isAdult }) => {
          return isAdult();
        },
      });

    // Missing required 'userId' and 'age' is a string instead of number
    const [errors, context] = await instance.contextFor({
      userId: 123,
      age: "not-a-number",
    } as any);

    expect(errors).toBeDefined();
    expect(Array.isArray(errors)).toBe(true);
    expect(errors!.length).toBeGreaterThan(0);
    expect(context).toBeUndefined();
    expect(errors![0]!.message).toMatch(/Expected string but received \d+/);
  });
});
