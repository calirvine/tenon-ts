import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      exclude: [
        "src/index.ts", // ignore main entrypoint
        "examples/**", // ignore all example files
        "vitest.config.ts", // ignore this file
      ],
    },
  },
});
