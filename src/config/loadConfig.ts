// src/utils/loadConfig.ts
import { resolve, extname } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { register } from "esbuild-register/dist/node";
import type { HonoDocsConfig } from "../types";

export async function loadConfig(configFile: string): Promise<HonoDocsConfig> {
  const fullPath = resolve(process.cwd(), configFile);

  if (!existsSync(fullPath)) {
    throw new Error(`[hono-docs] Config file not found: ${fullPath}`);
  }

  const ext = extname(fullPath);
  const require = createRequire(import.meta.url);

  // Register esbuild for .ts/.js
  const reg = register({ target: "es2020", jsx: "automatic" });
  let configModule: unknown;

  try {
    if (ext === ".mjs" || ext === ".mts") {
      // Native ESM
      configModule = await import(pathToFileURL(fullPath).href);
    } else {
      // TS or CJS config
      configModule = require(fullPath);
    }
  } catch (err) {
    throw new Error(
      `[hono-docs] Failed to load config: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    reg.unregister();
  }

  const config =
    configModule &&
    typeof configModule === "object" &&
    "default" in configModule
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (configModule as any).default
      : configModule;

  if (!config || typeof config !== "object") {
    throw new Error(
      `[hono-docs] Invalid config file. Expected an object, got: ${typeof config}`
    );
  }

  return config as HonoDocsConfig;
}
