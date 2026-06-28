import { resolve } from "path";
import { existsSync } from "fs";
import { unwrapModule } from "../utils/libDir";
import type { HonoDocsConfig } from "../types";
import { pathToFileURL } from "node:url";

export async function loadConfig(configFile: string): Promise<HonoDocsConfig> {
  // 1. Resolve absolute path
  const fullPath = resolve(process.cwd(), configFile);
  if (!existsSync(fullPath)) {
    throw new Error(`[hono-docs] Config file not found: ${fullPath}`);
  }

  // 2. Dynamically load the config via jiti
  let configModule: unknown;
  try {
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url);
    // Use pathToFileURL to guarantee cross-platform compatibility (Windows C:\ paths)
    configModule = await jiti.import(pathToFileURL(fullPath).href, {
      default: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    throw new Error(
      `[hono-docs] Failed to load config: ${err.message ?? String(err)}`,
    );
  }

  const config = unwrapModule(configModule);

  if (!config || typeof config !== "object") {
    throw new Error(
      `[hono-docs] Invalid config file. Expected an object, got: ${typeof config}`,
    );
  }

  // console.log({ config });
  return config as HonoDocsConfig;
}
