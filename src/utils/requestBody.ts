// src/utils/requestBody.ts
import { buildSchema } from "./buildSchema";
import { resolveValidatorSchema } from "../schema-resolver/index";
import { logger } from "./logger";
import type { OpenAPIV3 } from "openapi-types";
import type { Project, Type, TypeChecker, Node } from "ts-morph";
import type { CacheManager } from "../cache/index";
import type { OpenAPIVersionAdapter } from "../openapi/adapter";
import { v30Adapter } from "../openapi/adapters/v3-0";

export interface GenRequestBodyOptions {
  type: Type;
  typeChecker: TypeChecker;
  contextNode: Node;
  routePath?: string;
  method?: string;
  project?: Project;
  rootPath?: string;
  cacheManager?: CacheManager;
  /** Version adapter for nullable and schema transforms. Defaults to 3.0. */
  adapter?: OpenAPIVersionAdapter;
}

export async function genRequestBody(
  options: GenRequestBodyOptions,
): Promise<OpenAPIV3.RequestBodyObject | null> {
  const {
    type,
    typeChecker,
    contextNode,
    routePath,
    method,
    project,
    rootPath,
    cacheManager,
    adapter = v30Adapter,
  } = options;
  const inpProp = type.getProperty("input");
  if (!inpProp) return null;
  const inp = typeChecker.getTypeOfSymbolAtLocation(inpProp, contextNode);
  if (!inp) return null;

  const content: { [media: string]: OpenAPIV3.MediaTypeObject } = {};

  // ── JSON body ────────────────────────────────────────────────────────────────
  const jProp = inp.getProperty("json");
  if (jProp) {
    const jType = typeChecker.getTypeOfSymbolAtLocation(jProp, contextNode);

    // Attempt runtime schema resolution for higher accuracy
    let jsonSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null =
      null;

    if (routePath && method && project && rootPath) {
      const resolved = await resolveValidatorSchema(
        routePath,
        method,
        "json",
        project,
        typeChecker,
        rootPath,
        cacheManager,
        adapter,
      );
      if (resolved) {
        jsonSchema = resolved.schema as OpenAPIV3.SchemaObject;
        logger.record(method, routePath, "json", resolved.library);
      }
    }

    // Fall back to type-based schema if resolution failed or no validator found
    if (!jsonSchema) {
      jsonSchema = buildSchema({
        type: jType,
        typeChecker,
        contextNode,
        adapter,
      });
      if (routePath && method) {
        logger.record(method, routePath, "json", "ts type");
      }
    }

    content["application/json"] = { schema: jsonSchema };
  }

  // ── Form body ────────────────────────────────────────────────────────────────
  const fProp = inp.getProperty("form");
  if (fProp) {
    const fType = typeChecker.getTypeOfSymbolAtLocation(fProp, contextNode);

    let formSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null =
      null;

    if (routePath && method && project && rootPath) {
      const resolved = await resolveValidatorSchema(
        routePath,
        method,
        "form",
        project,
        typeChecker,
        rootPath,
        cacheManager,
        adapter,
      );
      if (resolved) {
        formSchema = resolved.schema as OpenAPIV3.SchemaObject;
        logger.record(method, routePath, "form", resolved.library);
      }
    }

    if (!formSchema) {
      formSchema = buildSchema({
        type: fType,
        typeChecker,
        contextNode,
        adapter,
      });
      if (routePath && method) {
        logger.record(method, routePath, "form", "ts type");
      }
    }

    content["multipart/form-data"] = { schema: formSchema };
  }

  return Object.keys(content).length ? { required: true, content } : null;
}
