// src/schema-resolver/index.ts
// Public API for the schema resolver subsystem.
// Orchestrates all 5 steps: locate → detect → trace → load → convert.

import type { Project, TypeChecker } from "ts-morph";
import type { SchemaResolverResult, ValidatorLibrary } from "../types/index";
import type { CacheManager } from "../cache/index";
import { locateRouteNode } from "./locateRouteNode";
import { detectSchemaArgs } from "./detectSchemaArg";
import { traceDeclaration } from "./traceDeclaration";
import { loadLiveSchema } from "./loadSchema";
import { convertZodSchema } from "./converters/zodConverter";
import { convertValibotSchema } from "./converters/valibotConverter";
import { convertTypeBoxSchema } from "./converters/typeboxConverter";
import { convertArktypeSchema } from "./converters/arktypeConverter";
import { attachSchemaName } from "../utils/schemaHelper";

import type { OpenAPIV3 } from "openapi-types";

/**
 * Attempts to resolve the full OpenAPI schema for a specific validator target
 * (json, form, query, param) on a given route, by:
 *
 * 1. Locating the Hono route call expression in the AST
 * 2. Finding the schema argument via type fingerprinting (name-agnostic)
 * 3. Tracing the schema identifier to its source file and export
 * 4. Dynamically loading the live schema object using jiti
 * 5. Converting with the appropriate library-native serializer
 *
 * Returns a SchemaResolverResult on success, or null if any step fails
 * (triggering the existing buildSchema fallback in the caller).
 *
 * @param cacheManager - Optional cache manager. When provided, schema results
 *   are cached by file-content hash so repeated runs skip jiti entirely.
 */
export async function resolveValidatorSchema(
  routePath: string,
  method: string,
  target: string,
  project: Project,
  typeChecker: TypeChecker,
  rootPath: string,
  cacheManager?: CacheManager,
): Promise<SchemaResolverResult | null> {
  try {
    // Step 1: Locate the route call in AST
    const routeNode = locateRouteNode(method, routePath, project);
    if (!routeNode) return null;

    // Step 2: Detect schema arguments (name-agnostic type fingerprinting)
    const schemaArgs = detectSchemaArgs(routeNode, typeChecker);
    if (!schemaArgs.length) return null;

    const match = schemaArgs.find((s) => s.target === target);
    if (!match) return null;

    const library: ValidatorLibrary = match.library;

    // Step 3: Trace to source declaration (handles cross-file imports + path aliases)
    const traceResult = traceDeclaration(match.node);
    if (!traceResult) return null;

    // ── Schema-level cache check ─────────────────────────────────────────────
    // Key = hash of file content + export name, so any edit to the schema file
    // busts the cache entry automatically.
    let schemaKey = "";
    if (cacheManager) {
      let fileHash = "";
      const sf = project.getSourceFile(traceResult.filePath);
      if (sf) {
        const deps = new Set<string>([traceResult.filePath]);
        const queue = [sf];
        while (queue.length > 0) {
          const curr = queue.pop()!;
          for (const ref of curr.getReferencedSourceFiles()) {
            const refPath = ref.getFilePath();
            if (!refPath.includes("node_modules") && !deps.has(refPath)) {
              deps.add(refPath);
              queue.push(ref);
            }
          }
        }
        fileHash = cacheManager.hashGroup(Array.from(deps));
      } else {
        fileHash = cacheManager.hashFile(traceResult.filePath);
      }
      schemaKey = `${fileHash}:${traceResult.exportName}:${library}`;
      const cached = cacheManager.getSchemaCache(schemaKey);
      if (cached) {
        attachSchemaName(cached, traceResult.exportName);
        return { source: "dynamic", library, schema: cached };
      }
    }

    // Step 4: Load live schema instance via jiti (cache miss or no cache)
    const liveSchema = await loadLiveSchema(
      traceResult.filePath,
      traceResult.exportName,
      rootPath,
    );
    if (!liveSchema) return null;

    // Step 5: Convert using library-native serializer
    let schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null =
      null;

    switch (library) {
      case "zod":
        schema = (await convertZodSchema(
          liveSchema,
          rootPath,
        )) as OpenAPIV3.SchemaObject | null;
        break;
      case "valibot":
        schema = await convertValibotSchema(liveSchema, rootPath);
        break;
      case "typebox":
        schema = convertTypeBoxSchema(
          liveSchema,
        ) as OpenAPIV3.SchemaObject | null;
        break;
      case "arktype":
        schema = convertArktypeSchema(
          liveSchema,
        ) as OpenAPIV3.SchemaObject | null;
        break;
      default:
        return null;
    }

    if (!schema) return null;

    attachSchemaName(schema, traceResult.exportName);

    if (cacheManager && schemaKey) {
      cacheManager.setSchemaCache(schemaKey, schema as OpenAPIV3.SchemaObject);
    }

    return { source: "dynamic", library, schema };
  } catch {
    return null;
  }
}
