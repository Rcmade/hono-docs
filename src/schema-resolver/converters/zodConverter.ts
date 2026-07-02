// src/schema-resolver/converters/zodConverter.ts
// Converts a live Zod schema instance to OpenAPI-compatible JSON Schema.
// Uses Zod v4's native z.toJSONSchema() — zero extra dependencies needed.

import type { OpenAPIV3 } from "openapi-types";

/**
 * Converts a live Zod schema to an OpenAPI 3.0-compatible JSON Schema.
 *
 * Since we already have the live Zod schema instance (loaded from the user's
 * project), we can get the `zod` module from the same resolution context.
 *
 * Preserves all constraints: minLength, maxLength, minimum, maximum, pattern,
 * format (email, uuid, uri, date-time), enum values, required fields, etc.
 */
export async function convertZodSchema(
  schema: object,
  cwd: string,
): Promise<OpenAPIV3.SchemaObject | null> {
  try {
    const zodSchema = schema as Record<string, unknown>;

    // Verify it is a Zod schema by checking for _def
    if (!zodSchema || typeof zodSchema !== "object" || !zodSchema._def) {
      return null;
    }

    // Load zod from the user's project context using jiti
    // This ensures we load THEIR version of zod (v3 or v4) not the library's
    const { createJiti } = await import("jiti");
    const jiti = createJiti(cwd, { interopDefault: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let zodModule: any = null;
    try {
      zodModule = jiti("zod");
    } catch {
      // Zod not in user's node_modules — cannot convert
      return null;
    }

    // Zod v4: z.toJSONSchema is a top-level export
    const toJSONSchema =
      zodModule?.toJSONSchema ??
      zodModule?.z?.toJSONSchema ??
      zodModule?.default?.toJSONSchema;

    if (typeof toJSONSchema !== "function") {
      // Zod v3 — no native toJSONSchema; would need zod-to-json-schema
      // For now return null to fall back to type-based
      return null;
    }

    const result = toJSONSchema(zodSchema, {
      target: "openapi-3.0",
      // Map unrepresentable types (bigint, custom) to {}
      unrepresentable: "any",
    });

    if (result && typeof result === "object") {
      // Strip $schema field not needed in inline OpenAPI schemas
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { $schema: _schema, ...clean } = result as Record<string, unknown>;
      return clean as OpenAPIV3.SchemaObject;
    }

    return (result as OpenAPIV3.SchemaObject) ?? null;
  } catch {
    return null;
  }
}
