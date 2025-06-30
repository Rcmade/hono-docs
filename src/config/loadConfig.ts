// src/cli/loadConfig.ts
import { resolve } from "path";
import { existsSync } from "fs";
// <-- import tsImport from tsx:
import { tsImport } from "tsx/esm/api";
import type { HonoDocsConfig } from "../types";
import { unwrapModule } from "../utils/libDir";

export async function loadConfig(configFile: string): Promise<HonoDocsConfig> {
  // 1. Resolve absolute path
  const fullPath = resolve(process.cwd(), configFile);
  if (!existsSync(fullPath)) {
    throw new Error(`[hono-docs] Config file not found: ${fullPath}`);
  }

  // 2. Dynamically load the config via tsx's tsImport()
  let configModule: unknown;
  try {
    // tsImport(filePath, importMetaUrl) returns the loaded module
    configModule = await tsImport(fullPath, import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    throw new Error(
      `[hono-docs] Failed to load config: ${err.message ?? String(err)}`
    );
  }

  const config = unwrapModule(configModule);

  if (!config || typeof config !== "object") {
    throw new Error(
      `[hono-docs] Invalid config file. Expected an object, got: ${typeof config}`
    );
  }

  // console.log({ config });
  return config as HonoDocsConfig;
}
