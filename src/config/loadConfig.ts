import { resolve, extname } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { register } from "esbuild-register/dist/node";
import type { HonoDocsConfig } from "../types";
import { createRequire } from "node:module";

/**
 * Supports .ts, .js, .cjs via require (hooked by esbuild-register)
 * and native import for .mjs/.mts files.
 */
export async function loadConfig(configFile: string): Promise<HonoDocsConfig> {
  const fullPath = resolve(process.cwd(), configFile);

  if (!existsSync(fullPath)) {
    throw new Error(`[hono-docs] Config file not found: ${fullPath}`);
  }

  const ext = extname(fullPath);
  let unregister = () => {};
  let configModule: unknown;

  try {
    if (ext === ".mjs" || ext === ".mts") {
      // Native ESM import
      configModule = await import(pathToFileURL(fullPath).href);
    } else {
      // Register esbuild only for .ts, .js, .cjs
      const reg = register({ target: "es2020", jsx: "automatic" });
      unregister = reg.unregister;

      // Forcefully use require to load .ts or .js
      const req = createRequire(import.meta.url);
      configModule = req(fullPath);
    }
  } catch (err) {
    unregister();
    throw new Error(
      `[hono-docs] Failed to load config: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    unregister();
  }

  const config =
    configModule &&
    typeof configModule === "object" &&
    "default" in configModule
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (configModule as any).default
      : configModule;

  if (!config || typeof config !== "object") {
    throw new Error(
      `[hono-docs] Invalid config file. Expected an object, got: ${typeof config}`
    );
  }

  return config as HonoDocsConfig;
}
