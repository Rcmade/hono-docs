// src/openapi/adapters/v3-1.ts
// OpenAPI 3.1 adapter.
// Key difference from 3.0:
//   - `nullable: true` is invalid; use `type: [T, "null"]` (JSON Schema 2020-12)
//   - Document root includes `$schema` pointing to JSON Schema 2020-12
//   - `openapi` version string is "3.1.0"

import type { OpenAPIVersionAdapter, AnySchemaObject } from "../adapter";
import { OPENAPI_VERSIONS, ZOD_TARGETS } from "../../utils/constants";

export const v31Adapter: OpenAPIVersionAdapter = {
  version: OPENAPI_VERSIONS.v3_1,
  zodTarget: ZOD_TARGETS.v3_1,

  makeNullable(schema: AnySchemaObject): AnySchemaObject {
    const s = schema as Record<string, unknown>;

    // Remove any 3.0-style nullable flag that may have leaked in
    const rest = { ...s };
    delete rest.nullable;

    // Determine the existing type to extend with "null"
    const existingType = rest.type;
    let newType: unknown;

    if (Array.isArray(existingType)) {
      // Already an array — add "null" if not present
      newType = existingType.includes("null")
        ? existingType
        : [...existingType, "null"];
    } else if (typeof existingType === "string") {
      newType = [existingType, "null"];
    } else {
      // No type field — use null in anyOf style
      return {
        ...rest,
        anyOf: [rest, { type: "null" }],
      };
    }

    return { ...rest, type: newType };
  },

  makeDocumentRoot(base: Record<string, unknown>): Record<string, unknown> {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...base,
      openapi: OPENAPI_VERSIONS.v3_1,
    };
  },
};
