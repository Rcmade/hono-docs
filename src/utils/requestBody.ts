// src/utils/requestBody.ts
import { buildSchema } from "./buildSchema";
import { resolveValidatorSchema } from "../schema-resolver/index";
import { logger } from "./logger";
import type { OpenAPIV3 } from "openapi-types";
import type { Project, Type, TypeChecker, Node } from "ts-morph";

export interface GenRequestBodyOptions {
  type: Type;
  typeChecker: TypeChecker;
  contextNode: Node;
  routePath?: string;
  method?: string;
  project?: Project;
  rootPath?: string;
}

export async function genRequestBody(
  options: GenRequestBodyOptions
): Promise<OpenAPIV3.RequestBodyObject | null> {
  const { type, typeChecker, contextNode, routePath, method, project, rootPath } = options;
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
      );
      if (resolved) {
        jsonSchema = resolved.schema as OpenAPIV3.SchemaObject;
        logger.record(method, routePath, "json", resolved.library);
      }
    }

    // Fall back to type-based schema if resolution failed or no validator found
    if (!jsonSchema) {
      jsonSchema = buildSchema(jType, typeChecker, contextNode);
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
      );
      if (resolved) {
        formSchema = resolved.schema as OpenAPIV3.SchemaObject;
        logger.record(method, routePath, "form", resolved.library);
      }
    }

    if (!formSchema) {
      formSchema = buildSchema(fType, typeChecker, contextNode);
    }

    content["multipart/form-data"] = { schema: formSchema };
  }

  return Object.keys(content).length ? { required: true, content } : null;
}
