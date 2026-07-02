// src/schema-resolver/converters/valibotConverter.ts
// Converts a live Valibot schema instance to an OpenAPI JSON Schema.
// Uses the official @valibot/to-json-schema package.

import type { OpenAPIV3 } from "openapi-types";

/**
 * Converts a live Valibot schema instance to an OpenAPI 3.0-compatible JSON Schema.
 *
 * Edge cases:
 * - `v.transform()`: uses typeMode: "input" to get input shape
 * - `v.custom()`: returns {}
 * - `v.lazy()` recursive: handled by the library with depth limits
 */
export async function convertValibotSchema(
  schema: object,
  cwd: string,
): Promise<OpenAPIV3.SchemaObject | null> {
  try {
    const valibotSchema = schema as Record<string, unknown>;

    // Validate it is a Valibot schema by checking for _run or ~run
    if (
      !valibotSchema ||
      typeof valibotSchema !== "object" ||
      !(valibotSchema._run || valibotSchema["~run"])
    ) {
      return null;
    }

    const { createJiti } = await import("jiti");
    const jiti = createJiti(cwd, { interopDefault: true });

    let toJsonSchema;
    try {
      const mod = jiti("@valibot/to-json-schema");
      toJsonSchema = mod?.toJsonSchema ?? mod?.default?.toJsonSchema;
    } catch {
      return null;
    }

    if (typeof toJsonSchema !== "function") return null;

    const result = toJsonSchema(valibotSchema, {
      // Use input type for transforms
      typeMode: "input",
    });

    if (result && typeof result === "object") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { $schema: _schema, ...clean } = result as Record<string, unknown>;
      return clean as OpenAPIV3.SchemaObject;
    }

    return (result as OpenAPIV3.SchemaObject) ?? null;
  } catch {
    return null;
  }
}
