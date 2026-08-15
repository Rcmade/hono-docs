// src/openapi/adapter.ts
// Defines the version adapter interface that every OpenAPI version must implement.
// Adding a new OpenAPI version = create one new file in src/openapi/adapters/.

import type { OpenAPIV3 } from "openapi-types";

import { ZOD_TARGETS } from "../utils/constants";

export type AnySchemaObject = OpenAPIV3.SchemaObject | Record<string, unknown>;

/**
 * Version adapter interface.
 * Each OpenAPI version implements this contract.
 */
export interface OpenAPIVersionAdapter {
  /** The exact OpenAPI version string emitted in the document root (e.g. "3.0.3") */
  readonly version: string;

  /**
   * Transform a schema that represents a nullable type.
   * - 3.0: adds `nullable: true`
   * - 3.1: replaces with `type: [T, "null"]`
   */
  makeNullable(schema: AnySchemaObject): AnySchemaObject;

  /**
   * Decorate the final merged document root with version-specific fields.
   * - 3.0: sets `openapi: "3.0.3"`
   * - 3.1: sets `openapi: "3.1.0"` and adds `$schema`
   */
  makeDocumentRoot(base: Record<string, unknown>): Record<string, unknown>;

  /**
   * The target string to pass to Zod v4's `toJSONSchema()`.
   * - 3.0: "openapi-3.0"
   * - 3.1: "openapi-3.1"
   */
  readonly zodTarget: (typeof ZOD_TARGETS)[keyof typeof ZOD_TARGETS];
}
