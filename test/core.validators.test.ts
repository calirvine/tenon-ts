import {
  object as valibotObject,
  string as valibotString,
  number as valibotNumber,
} from "valibot";
import { describe, it, expect } from "vitest";
import { z } from "zod";

import { TenonBuilder } from "../src/core.js";

// --- Valibot subject schema tests ---
describe("SegmentBuilder with valibot", () => {
  const subjectSchema = valibotObject({
    userId: valibotString(),
    age: valibotNumber(),
  });

  const instance = new TenonBuilder(subjectSchema)
    .matchers((createMatcher) => ({
      isAdult: createMatcher({
        evaluate: ({ params }) => params.age >= 18,
      }),
    }))
    .segments({
      adult: ({ matchers }) => matchers.isAdult(),
    });

  it("matches segment for valid input", async () => {
    const result = await instance.contextFor({ userId: "abc", age: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("adult")).toBe(true);
  });

  it("returns validation error for invalid input", async () => {
    const result = await instance.contextFor({
      // @ts-expect-error: intentionally passing wrong type to test validation
      userId: 123,
      // @ts-expect-error: intentionally passing wrong type to test validation
      age: "bad",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error context");
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

// --- Zod subject schema tests ---
describe("SegmentBuilder with zod", () => {
  // Zod subject schema
  const subjectSchema = z.object({
    userId: z.string(),
    age: z.number(),
  });

  const instance = new TenonBuilder(subjectSchema)
    .matchers((createMatcher) => ({
      isAdult: createMatcher({
        evaluate: ({ params }) => params.age >= 18,
      }),
    }))
    .segments({
      adult: ({ matchers }) => matchers.isAdult(),
    });

  it("matches segment for valid input", async () => {
    const result = await instance.contextFor({ userId: "abc", age: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok context");
    expect(await result.matches("adult")).toBe(true);
  });

  it("returns validation error for invalid input", async () => {
    const result = await instance.contextFor({
      // @ts-expect-error: intentionally passing wrong type to test validation
      userId: 123,
      // @ts-expect-error: intentionally passing wrong type to test validation
      age: "bad",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error context");
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
