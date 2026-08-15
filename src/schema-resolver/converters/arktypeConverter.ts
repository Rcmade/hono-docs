// src/schema-resolver/converters/arktypeConverter.ts
// Converts an Arktype schema instance to OpenAPI-compatible JSON Schema.

import type { OpenAPIV3 } from "openapi-types";

/**
 * Converts a live Arktype schema to an OpenAPI 3.0-compatible JSON Schema.
 */
export function convertArktypeSchema(
  schema: object,
): OpenAPIV3.SchemaObject | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arkSchema: any = schema;

    // Verify it is an Arktype schema with a toJsonSchema method
    if (
      !arkSchema ||
      (typeof arkSchema !== "object" && typeof arkSchema !== "function") ||
      typeof arkSchema.toJsonSchema !== "function"
    ) {
      return null;
    }

    const result = arkSchema.toJsonSchema();

    if (result && typeof result === "object") {
      // Strip $schema field not needed in inline OpenAPI schemas
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { $schema: _schema, ...clean } = result as Record<string, unknown>;
      return clean as OpenAPIV3.SchemaObject;
    }

    return null;
  } catch {
    return null;
  }
}
