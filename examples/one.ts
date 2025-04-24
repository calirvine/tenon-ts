import { object, string, number, optional, date } from "valibot";
import { TenonBuilder } from "../src/index.js";

const user = {
  userId: "123",
  country: "US",
  age: 25,
  subscription: "premium",
  createdAt: new Date("2025-04-29"),
};

const subjectSchema = object({
  userId: string(),
  country: optional(string()),
  age: optional(number()),
  subscription: optional(string()),
  createdAt: date(),
});

const instance = new TenonBuilder(subjectSchema)
  .matchers((createMatcher) => ({
    isFromCountry: createMatcher({
      arguments: string(),
      evaluate: ({ params, arg }) => params.country === arg,
    }),
    createdAfter: createMatcher({
      arguments: date(),
      evaluate: ({ params, arg }) => params.createdAt > arg,
    }),
    isAdult: createMatcher({
      evaluate: ({ params }) =>
        typeof params.age === "number" && params.age >= 18,
    }),
  }))
  .segments({
    newUser: ({ logicalOperators, matchers }) => {
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
      return logicalOperators.and(
        matchers.isFromCountry("US"),
        matchers.createdAfter(new Date(Date.now() - ONE_WEEK))
      );
    },
    usAdult: ({ logicalOperators, matchers }) => {
      return logicalOperators.and(
        matchers.isFromCountry("US"),
        matchers.isAdult()
      );
    },
    usChildOrNonAmericanAdult: ({ logicalOperators, matchers }) => {
      return logicalOperators.or(
        logicalOperators.and(matchers.isFromCountry("US"), matchers.isAdult()),
        logicalOperators.and(
          logicalOperators.not(matchers.isFromCountry("US")),
          matchers.isAdult()
        )
      );
    },
  });

const result = await instance.contextFor(user);

if (!result.ok) {
  console.error(result.issues);
} else {
  console.log("matches newUser", await result.matches("newUser"));
  console.log("matches usAdult", await result.matches("usAdult"));
  console.log(
    "matches usChildOrNonAmericanAdult",
    await result.matches("usChildOrNonAmericanAdult")
  );
}
