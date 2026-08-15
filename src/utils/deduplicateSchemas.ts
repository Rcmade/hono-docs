import { createHash } from "node:crypto";
import type { OpenAPIV3 } from "openapi-types";
import { X_SCHEMA_NAME } from "./schemaHelper";

interface DiscoveredSchema {
  hash: string;
  schema: Record<string, unknown>;
  count: number;
  explicitNames: Set<string>;
  fallbackNames: Set<string>;
  assignedRef?: string;
}

/**
 *  helper to determine the OpenAPI $ref target prefix based on version string.
 */
function getRefPrefix(openapiVersion?: string): string {
  // Supports OpenAPI 3.0.x and 3.1.x
  if (openapiVersion && openapiVersion.startsWith("2.")) {
    return "#/definitions/";
  }
  return "#/components/schemas/";
}

/**
 * Compute a deterministic structural SHA-256 fingerprint of a schema object,
 * ignoring auxiliary runtime metadata like x-schema-name.
 */
function hashSchemaStructure(schema: Record<string, unknown>): string {
  const cleaned: Record<string, unknown> = {};
  const sortedKeys = Object.keys(schema).sort();
  for (const k of sortedKeys) {
    if (k === X_SCHEMA_NAME) continue;
    cleaned[k] = schema[k];
  }
  return createHash("sha256").update(JSON.stringify(cleaned)).digest("hex");
}

/**
 * Check if a schema object qualifies as a candidate for component extraction.
 * Primitives and simple array wrappers are kept inline unless explicitly named.
 */
function isComponentCandidate(s: Record<string, unknown>): boolean {
  if (!s || typeof s !== "object" || s.$ref) return false;

  // Always qualify if developer explicitly named the schema or type in code
  if (s[X_SCHEMA_NAME] && typeof s[X_SCHEMA_NAME] === "string") return true;

  // Qualify complex object structures
  if (
    s.properties &&
    typeof s.properties === "object" &&
    Object.keys(s.properties).length > 0
  ) {
    return true;
  }
  if (s.additionalProperties && typeof s.additionalProperties === "object") {
    return true;
  }
  if (s.type === "object" && Object.keys(s).length > 1) {
    return true;
  }

  // Qualify polymorphic schema unions and intersections
  if (Array.isArray(s.oneOf) && s.oneOf.length > 0) return true;
  if (Array.isArray(s.allOf) && s.allOf.length > 0) return true;
  if (Array.isArray(s.anyOf) && s.anyOf.length > 0) return true;

  return false;
}

/**
 * Helper to sanitize variable names or symbol names into valid OpenAPI component names.
 * Preserves exact case and wording while stripping illegal characters.
 */
function sanitizeComponentName(name: string): string {
  return (
    name.replace(/[^a-zA-Z0-9._-]/g, "").replace(/^[0-9]/, "S$&") ||
    "SharedSchema"
  );
}

/**
 * Helper to convert strings to PascalCase for clean OpenAPI schema names.
 */
function toPascalCase(str: string): string {
  return str
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]+$/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
}

/**
 * Main entry point for post-processing component schema deduplication.
 * Operates safely across any OpenAPI specification or validator library.
 */
export function deduplicateComponents(
  doc: OpenAPIV3.Document,
): OpenAPIV3.Document {
  const refPrefix = getRefPrefix(doc.openapi);
  if (!doc.components) doc.components = {};
  if (!doc.components.schemas) doc.components.schemas = {};

  const discovered = new Map<string, DiscoveredSchema>();

  // ── Phase 1: Hoist Third-Party Library local definitions ($defs / definitions) ────
  function migrateLocalDefinitions(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) migrateLocalDefinitions(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const defKey of ["$defs", "definitions"]) {
      if (obj[defKey] && typeof obj[defKey] === "object") {
        const defs = obj[defKey] as Record<string, Record<string, unknown>>;
        for (const [name, schemaObj] of Object.entries(defs)) {
          if (schemaObj && typeof schemaObj === "object") {
            if (!schemaObj[X_SCHEMA_NAME]) schemaObj[X_SCHEMA_NAME] = name;
            migrateLocalDefinitions(schemaObj);
          }
        }
        delete obj[defKey];
      }
    }
    for (const val of Object.values(obj)) {
      migrateLocalDefinitions(val);
    }
  }
  migrateLocalDefinitions(doc.paths);

  // ── Phase 2: Bottom-Up Discovery & Frequency Counting ──────────────────────
  function registerCandidate(
    schema: Record<string, unknown>,
    fallbackName: string,
  ): void {
    const hash = hashSchemaStructure(schema);
    let entry = discovered.get(hash);
    if (!entry) {
      entry = {
        hash,
        schema: { ...schema },
        count: 0,
        explicitNames: new Set<string>(),
        fallbackNames: new Set<string>(),
      };
      discovered.set(hash, entry);
    }
    entry.count++;
    if (typeof schema[X_SCHEMA_NAME] === "string") {
      entry.explicitNames.add(schema[X_SCHEMA_NAME] as string);
    }
    if (fallbackName && fallbackName !== "default") {
      entry.fallbackNames.add(fallbackName);
    }
  }

  function traverseDiscovery(node: unknown, fallbackName: string): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) =>
        traverseDiscovery(item, `${fallbackName}_${idx + 1}`),
      );
      return;
    }

    const obj = node as Record<string, unknown>;

    // Rewrite internal references from $defs/definitions to components/schemas
    if (typeof obj.$ref === "string") {
      if (
        obj.$ref.startsWith("#/$defs/") ||
        obj.$ref.startsWith("#/definitions/")
      ) {
        const name = obj.$ref.split("/").pop()!;
        obj.$ref = `${refPrefix}${name}`;
      }
      return;
    }

    // Process children first (bottom-up traversal)
    if (obj.properties && typeof obj.properties === "object") {
      for (const [propName, propVal] of Object.entries(
        obj.properties as Record<string, unknown>,
      )) {
        traverseDiscovery(propVal, `${fallbackName}_${propName}`);
      }
    }
    if (obj.items && typeof obj.items === "object") {
      traverseDiscovery(obj.items, `${fallbackName}_Item`);
    }
    if (
      obj.additionalProperties &&
      typeof obj.additionalProperties === "object"
    ) {
      traverseDiscovery(obj.additionalProperties, `${fallbackName}_Value`);
    }
    for (const unionKey of ["oneOf", "allOf", "anyOf"]) {
      if (Array.isArray(obj[unionKey])) {
        (obj[unionKey] as unknown[]).forEach((item, idx) => {
          traverseDiscovery(item, `${fallbackName}_Variant${idx + 1}`);
        });
      }
    }

    // Also traverse content media schemas in operation responses / requestBodies
    if (obj.content && typeof obj.content === "object") {
      for (const media of Object.values(
        obj.content as Record<string, Record<string, unknown>>,
      )) {
        if (media && media.schema) {
          traverseDiscovery(media.schema, fallbackName);
        }
      }
    }
    if (obj.schema && typeof obj.schema === "object" && !obj.content) {
      traverseDiscovery(obj.schema, fallbackName);
    }
    if (obj.headers && typeof obj.headers === "object") {
      for (const [hdrName, hdrObj] of Object.entries(
        obj.headers as Record<string, Record<string, unknown>>,
      )) {
        if (hdrObj && hdrObj.schema) {
          traverseDiscovery(hdrObj.schema, `${fallbackName}_${hdrName}Header`);
        }
      }
    }

    // Now evaluate current object as a candidate schema
    if (isComponentCandidate(obj)) {
      registerCandidate(obj, fallbackName);
    }
  }

  for (const [pathKey, operations] of Object.entries(doc.paths || {})) {
    if (!operations || typeof operations !== "object") continue;
    const cleanPath = pathKey.replace(/[^a-zA-Z0-9]/g, "_");
    for (const [method, operation] of Object.entries(
      operations as Record<string, Record<string, unknown>>,
    )) {
      if (!operation || typeof operation !== "object") continue;
      const opName = toPascalCase(`${method}_${cleanPath}`);
      if (operation.requestBody && typeof operation.requestBody === "object") {
        traverseDiscovery(operation.requestBody, `${opName}Body`);
      }
      if (operation.responses && typeof operation.responses === "object") {
        for (const [status, resp] of Object.entries(
          operation.responses as Record<string, unknown>,
        )) {
          traverseDiscovery(resp, `${opName}Response${status}`);
        }
      }
    }
  }

  // ── Phase 3: Component Allocation & Collision Resolution ───────────────────
  const existingSchemas = doc.components.schemas as Record<
    string,
    OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  >;
  const hashToRefMap = new Map<string, string>();

  const candidates = Array.from(discovered.values()).filter((item) => {
    // Keep named schemas, or any anonymous schema appearing multiple times
    return item.explicitNames.size > 0 || item.count > 1;
  });

  candidates.sort((a, b) => b.count - a.count || a.hash.localeCompare(b.hash));

    for (const cand of candidates) {
    let baseName = "SharedSchema";
    if (cand.explicitNames.size > 0) {
      baseName = Array.from(cand.explicitNames)[0];
      baseName = sanitizeComponentName(baseName);
    } else if (cand.fallbackNames.size > 0) {
      baseName = Array.from(cand.fallbackNames)[0];
      baseName = toPascalCase(baseName); // Convert fallback path hierarchy to clean PascalCase
      baseName = sanitizeComponentName(baseName);
    }

    // Collision resolution
    let finalName = baseName;
    let counter = 2;
    while (existingSchemas[finalName]) {
      // Check if structurally identical to existing schema under that name
      const existingHash = hashSchemaStructure(
        existingSchemas[finalName] as unknown as Record<string, unknown>,
      );
      if (existingHash === cand.hash) {
        break;
      }
      finalName = `${baseName}_${counter++}`;
    }

    const cleanSchema = { ...cand.schema };
    delete cleanSchema[X_SCHEMA_NAME];

    existingSchemas[finalName] = cleanSchema as OpenAPIV3.SchemaObject;
    cand.assignedRef = `${refPrefix}${finalName}`;
    hashToRefMap.set(cand.hash, cand.assignedRef);
  }

  // ── Phase 4: Tree Rewriting & Cleanup ──────────────────────────────────────
  function rewriteTree(node: unknown, inComponents = false): unknown {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      return node.map((item) => rewriteTree(item, inComponents));
    }

    const obj = node as Record<string, unknown>;

    // Strip x-schema-name before emitting final JSON
    if (X_SCHEMA_NAME in obj) {
      delete obj[X_SCHEMA_NAME];
    }

    // Check if this object itself matches an extracted component
    if (!obj.$ref && isComponentCandidate(obj)) {
      const hash = hashSchemaStructure(obj);
      const assignedRef = hashToRefMap.get(hash);
      // Ensure we don't replace a root component in components.schemas with a reference to itself
      if (
        assignedRef &&
        (!inComponents ||
          obj !== existingSchemas[assignedRef.split("/").pop()!])
      ) {
        // We replace with $ref, but first check if child properties need rewriting for nested $refs
        const rewritten = { ...obj };
        for (const [k, v] of Object.entries(rewritten)) {
          rewritten[k] = rewriteTree(v, inComponents);
        }
        // If this exact node matches the top-level assigned Ref, replace with $ref
        const targetName = assignedRef.split("/").pop()!;
        if (!inComponents || existingSchemas[targetName] !== obj) {
          return { $ref: assignedRef };
        }
      }
    }

    // Recursively rewrite child nodes
    for (const [k, v] of Object.entries(obj)) {
      obj[k] = rewriteTree(v, inComponents);
    }
    return obj;
  }

  // Rewrite all operation paths
  doc.paths = rewriteTree(doc.paths) as OpenAPIV3.PathsObject;

  // Rewrite components.schemas themselves (for nested $ref composition)
  for (const [schemaName, schemaObj] of Object.entries(existingSchemas)) {
    existingSchemas[schemaName] = rewriteTree(
      schemaObj,
      true,
    ) as OpenAPIV3.SchemaObject;
  }

  return doc;
}
