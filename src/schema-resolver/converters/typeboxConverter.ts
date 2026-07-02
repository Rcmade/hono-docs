// src/schema-resolver/converters/typeboxConverter.ts
// Converts a live TypeBox schema instance to an OpenAPI JSON Schema.
// TypeBox schemas ARE JSON Schema by design, so this is largely a passthrough.

import type { OpenAPIV3 } from "openapi-types";

// TypeBox kind symbols used to verify it is a TypeBox schema
const TYPEBOX_KIND_KEY = Symbol.for("TypeBox.Kind");

/**
 * Converts a live TypeBox schema to an OpenAPI-compatible JSON Schema.
 * TypeBox schemas are structurally JSON Schema-compliant (draft-07 / draft-2020-12),
 * so we mostly strip internal TypeBox metadata and return the plain JSON Schema.
 *
 * Strips:
 * - `[Kind]` symbol property (internal TypeBox identifier)
 * - `[Hint]` symbol property (internal TypeBox hint)
 * - `static` property (TypeScript type helper)
 */
export function convertTypeBoxSchema(
  schema: object,
): OpenAPIV3.SchemaObject | null {
  try {
    const tbSchema = schema as Record<string, unknown>;

    // Verify it is a TypeBox schema by checking for the Kind symbol
    if (
      !tbSchema ||
      typeof tbSchema !== "object" ||
      !(TYPEBOX_KIND_KEY in tbSchema)
    ) {
      return null;
    }

    // Recursively strip TypeBox-specific internal symbol properties
    return stripTypeBoxMeta(tbSchema) as OpenAPIV3.SchemaObject;
  } catch {
    return null;
  }
}

function stripTypeBoxMeta(schema: unknown): object | null {
  if (Array.isArray(schema)) {
    return schema.map(stripTypeBoxMeta) as unknown as object;
  }

  if (typeof schema !== "object" || schema === null) return schema as null;

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(schema)) {
    // Skip TypeBox internal string keys
    if (key === "static") continue;

    const val = (schema as Record<string, unknown>)[key];
    if (typeof val === "object" && val !== null) {
      result[key] = stripTypeBoxMeta(val);
    } else {
      result[key] = val;
    }
  }

  return result;
}
