// src/utils/requestBody.ts
import { buildSchema } from "./buildSchema";
import { resolveValidatorSchema } from "../schema-resolver/index";
import { logger } from "./logger";
import type { OpenAPIV3 } from "openapi-types";
import type { Project, Type, TypeChecker, Node } from "ts-morph";
import type { CacheManager } from "../cache/index";
import type { OpenAPIVersionAdapter } from "../openapi/adapter";
import { v30Adapter } from "../openapi/adapters/v3-0";

import { MUTATING_METHODS } from "./constants";

export interface GenRequestBodyOptions {
  type: Type;
  typeChecker: TypeChecker;
  contextNode: Node;
  routePath?: string;
  /** Explicit display route path for logger registration and output buffering. */
  displayPath?: string;
  method?: string;
  project?: Project;
  rootPath?: string;
  cacheManager?: CacheManager;
  /** Version adapter for nullable and schema transforms. Defaults to 3.0. */
  adapter?: OpenAPIVersionAdapter;
}

/**
 * Determines whether a request body is required based on its schema.
 *
 * Only object-like schemas can be "partially optional": a body is required
 * when at least one property is mandatory. Primitive/array bodies, `$ref`s
 * (not inspectable here), and schemas composed via allOf/oneOf/anyOf fall
 * back to required when any member demands mandatory fields.
 */
function requestBodyRequired(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  defaultsMakePropertiesOptional = false,
): boolean {
  if ("$ref" in schema) return true;
  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  // OpenAPI 3.1 nullable objects use type: ["object", "null"]. Object-like
  // schemas are optional unless they declare a mandatory property; every
  // other explicitly typed body (primitive/array/etc.) must be sent.
  if (types.length > 0 && !types.includes("object")) return true;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const mandatory = defaultsMakePropertiesOptional
    ? required.filter((name) => {
        const property = schema.properties?.[name];
        // Zod v4's output-oriented conversion includes defaulted input keys in
        // `required`. They are omittable request properties, unlike a plain
        // TypeBox `default` annotation, so this is enabled per source library.
        return !(
          property &&
          typeof property === "object" &&
          !("$ref" in property) &&
          property.default !== undefined
        );
      })
    : required;
  if (mandatory.length > 0) return true;
  const compositionKeys = ["allOf", "oneOf", "anyOf"] as const;
  const isObjectLike =
    types.includes("object") ||
    schema.properties !== undefined ||
    schema.additionalProperties !== undefined ||
    compositionKeys.some((key) => Array.isArray(schema[key]));
  // Unknown schemas must retain the conservative required behavior.
  if (!isObjectLike) return true;
  for (const key of compositionKeys) {
    const subs = schema[key];
    if (
      Array.isArray(subs) &&
      subs.some(
        (s) =>
          typeof s === "object" &&
          requestBodyRequired(s, defaultsMakePropertiesOptional),
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function genRequestBody(
  options: GenRequestBodyOptions,
): Promise<OpenAPIV3.RequestBodyObject | null> {
  const {
    type,
    typeChecker,
    contextNode,
    routePath,
    displayPath,
    method,
    project,
    rootPath,
    cacheManager,
    adapter = v30Adapter,
  } = options;
  const logPath = displayPath || routePath;
  const inpProp = type.getProperty("input");
  const inp = inpProp
    ? typeChecker.getTypeOfSymbolAtLocation(inpProp, contextNode)
    : null;

  const content: { [media: string]: OpenAPIV3.MediaTypeObject } = {};
  // Track Zod schemas because Zod v4's converter uses output-oriented
  // `required` arrays, which include defaulted properties that are optional
  // as request input. Other libraries (notably TypeBox) have different
  // default semantics and must not receive this treatment.
  const zodSchemas = new WeakSet<object>();

  const isMutating = method ? MUTATING_METHODS.has(method.toLowerCase()) : false;

  // ── JSON body ────────────────────────────────────────────────────────────────
  const jProp = inp ? inp.getProperty("json") : undefined;
  if (!jProp && isMutating && routePath && method && project && rootPath) {
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
      content["application/json"] = {
        schema: resolved.schema as OpenAPIV3.SchemaObject,
      };
      if (resolved.library === "zod") zodSchemas.add(resolved.schema);
      if (logPath) logger.record(method, logPath, "json", resolved.library);
    }
  } else if (jProp) {
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
        if (resolved.library === "zod") zodSchemas.add(resolved.schema);
        if (logPath) logger.record(method, logPath, "json", resolved.library);
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
      if (logPath && method) {
        logger.record(method, logPath, "json", "ts type");
      }
    }

    content["application/json"] = { schema: jsonSchema };
  }

  // ── Form body ────────────────────────────────────────────────────────────────
  const fProp = inp ? inp.getProperty("form") : undefined;
  if (!fProp && isMutating && routePath && method && project && rootPath) {
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
      content["multipart/form-data"] = {
        schema: resolved.schema as OpenAPIV3.SchemaObject,
      };
      if (resolved.library === "zod") zodSchemas.add(resolved.schema);
      if (logPath) logger.record(method, logPath, "form", resolved.library);
    }
  } else if (fProp) {
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
        if (resolved.library === "zod") zodSchemas.add(resolved.schema);
        if (logPath) logger.record(method, logPath, "form", resolved.library);
      }
    }

    if (!formSchema) {
      formSchema = buildSchema({
        type: fType,
        typeChecker,
        contextNode,
        adapter,
      });
      if (logPath && method) {
        logger.record(method, logPath, "form", "ts type");
      }
    }

    content["multipart/form-data"] = { schema: formSchema };
  }

  if (!Object.keys(content).length) return null;

  // Derive requiredness from the body schema: a body is only required when
  // at least one property in the schema is mandatory (e.g. all-optional
  // filter objects produce `required: false`).
  const bodyRequired = Object.values(content).some((m) => {
    if (!m.schema) return false;
    return requestBodyRequired(m.schema, zodSchemas.has(m.schema));
  });
  return { required: bodyRequired, content };
}
