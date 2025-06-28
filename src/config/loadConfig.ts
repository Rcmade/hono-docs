import { resolve, extname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import type { HonoDocsConfig } from "../types";

/**
 * Load hono-docs config from a given path, supporting TS/JS/MJS/CJS files.
 */
export async function loadConfig(configFile: string): Promise<HonoDocsConfig> {
  const fullPath = resolve(process.cwd(), configFile);

  if (!existsSync(fullPath)) {
    throw new Error(`[hono-docs] Config file not found: ${fullPath}`);
  }

  const ext = extname(fullPath);

  let configModule: unknown;

  try {
    if (ext === ".mjs" || ext === ".mts") {
      // Pure ESM module — import directly
      configModule = await import(pathToFileURL(fullPath).href);
    } else if (
      ext === ".ts" ||
      ext === ".tsx" ||
      ext === ".js" ||
      ext === ".cjs"
    ) {
      // Use esbuild to transpile and eval as ESM
      const fileContent = readFileSync(fullPath, "utf-8");

      const { code } = await esbuild.transform(fileContent, {
        loader: ext === ".tsx" ? "tsx" : ext === ".ts" ? "ts" : "js",
        format: "esm",
        sourcemap: false,
        target: "es2020",
      });

      // Use `data:` URL to dynamically import transpiled code
      const base64 = Buffer.from(code).toString("base64");
      const dataUrl = `data:text/javascript;base64,${base64}`;

      configModule = await import(dataUrl);
    } else {
      throw new Error(`[hono-docs] Unsupported config file extension: ${ext}`);
    }
  } catch (err) {
    throw new Error(
      `[hono-docs] Failed to load config: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
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
