export const X_SCHEMA_NAME = "x-schema-name";

export function attachSchemaName(schema: unknown, name?: string | null) {
  if (name && name !== "default" && schema && typeof schema === "object") {
    if (!(schema as Record<string, unknown>)[X_SCHEMA_NAME]) {
      (schema as Record<string, unknown>)[X_SCHEMA_NAME] = name;
    }
  }
}
