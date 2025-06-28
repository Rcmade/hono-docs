// src/utils/libDir.ts

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns the root folder of the library, whether running in
 * development (src/) or installed (dist/).
 */
export function getLibDir(): string {
  // In CJS (__dirname is injected)
  if (typeof __dirname !== "undefined") {
    // When running from dist/core or dist/cli
    return resolve(__dirname, "../../");
  }
  // In ESM (import.meta.url)
  const __filename = fileURLToPath(import.meta.url);
  const __dirnameEsm = dirname(__filename);
  return resolve(__dirnameEsm, "../../");
}
