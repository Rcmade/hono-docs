// src/utils/libDir.ts

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns the root folder of the library, whether running in
 * development (src/) or installed (dist/).
 */
export function getLibDir(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl);
  const __dirname = dirname(__filename);
  return resolve(__dirname, "../../");
}
