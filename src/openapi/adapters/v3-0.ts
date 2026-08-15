// src/openapi/adapters/v3-0.ts
// OpenAPI 3.0 adapter — the existing behavior.
// nullable types use `nullable: true` (non-standard in 3.1, valid in 3.0).

import type { OpenAPIVersionAdapter, AnySchemaObject } from "../adapter";
import { OPENAPI_VERSIONS, ZOD_TARGETS } from "../../utils/constants";

export const v30Adapter: OpenAPIVersionAdapter = {
  version: OPENAPI_VERSIONS.v3_0,
  zodTarget: ZOD_TARGETS.v3_0,

  makeNullable(schema: AnySchemaObject): AnySchemaObject {
    return { ...schema, nullable: true };
  },

  makeDocumentRoot(base: Record<string, unknown>): Record<string, unknown> {
    // The `openapi` field comes from the user's config.openApi, we preserve it.
    // Only inject if not already present.
    return {
      openapi: OPENAPI_VERSIONS.v3_0,
      ...base,
    };
  },
};
