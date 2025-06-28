import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli/index.ts", "src/core/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm"],
  target: "node16",
  outExtension({ format }) {
    return { js: ".mjs" };
  },
  external: [
    "@rcmade/hono-docs",
    "@rcmade/hono-docs/package.json",
    "esbuild-register",
    "ts-morph",
    "yargs",
  ],
});
