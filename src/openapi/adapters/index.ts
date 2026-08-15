// src/openapi/adapters/index.ts
// Version adapter registry.
// Resolves an OpenAPI version string to the correct adapter.
//
// To add future version support (e.g. 3.2, 4.0):
//   1. Create src/openapi/adapters/v3-2.ts implementing OpenAPIVersionAdapter
//   2. Add one `if` line below

import { v30Adapter } from "./v3-0";
import { v31Adapter } from "./v3-1";
import type { OpenAPIVersionAdapter } from "../adapter";

export { v30Adapter } from "./v3-0";
export { v31Adapter } from "./v3-1";

/**
 * Resolve an openApiVersion string to the matching adapter.
 * Defaults to OpenAPI 3.0 when not specified.
 *
 * @param version - The string from `HonoDocsConfig.openApiVersion`, e.g. "3.0" or "3.1"
 */
export function getAdapter(version?: string): OpenAPIVersionAdapter {
  if (version?.startsWith("3.1")) return v31Adapter;
  // Default: OpenAPI 3.0 (zero breaking change for existing users)
  return v30Adapter;
}
