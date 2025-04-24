import { object, string, number, optional, date } from "valibot";
import { createSegmentBuilder, matcher } from "../src/index.js";

const user = {
  userId: "123",
  country: "US",
  age: 25,
  subscription: "premium",
  createdAt: new Date("2025-04-29"),
};

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

const [err, ctx] = await instance.contextFor(user);

if (err) {
  console.error(err);
}

if (ctx) {
  console.log("matches newUser", await ctx.matches("newUser"));
}
