import { buildSchema } from "./buildSchema";
import type { OpenAPIV3 } from "openapi-types";
import { resolveValidatorSchema } from "../schema-resolver/index";
import { logger } from "./logger";
import { VALIDATOR_TARGETS } from "./constants";
import type { Project, Type, TypeChecker, Node } from "ts-morph";
import type { CacheManager } from "../cache/index";
import type { OpenAPIVersionAdapter } from "../openapi/adapter";
import { v30Adapter } from "../openapi/adapters/v3-0";

function isArraySchema(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
): boolean {
  if ("$ref" in schema) return false;
  if (schema.type === "array") return true;
  if (schema.oneOf) return schema.oneOf.some(isArraySchema);
  if (schema.anyOf) return schema.anyOf.some(isArraySchema);
  return false;
}

export interface GenParamsOptions {
  type: Type;
  typeChecker: TypeChecker;
  contextNode: Node;
  routePath?: string;
  /** Explicit display route path for logger registration and output buffering. */
  displayPath?: string;
  method?: string;
  project?: Project;
  rootPath?: string;
  pathPatterns?: Record<string, string>;
  cacheManager?: CacheManager;
  /** Version adapter for nullable and schema transforms. Defaults to 3.0. */
  adapter?: OpenAPIVersionAdapter;
  /**
   * Only include path parameters that are present in the target path template.
   * If provided, any path parameter not in this list will be filtered out.
   */
  allowedParamNames?: string[];
  /**
   * Wildcard parameter name if applicable (e.g. "wildcard" or "path").
   */
  wildcardParamName?: string;
}

export async function genParameters(
  options: GenParamsOptions,
): Promise<OpenAPIV3.ParameterObject[]> {
  const {
    type,
    typeChecker,
    contextNode,
    routePath,
    displayPath,
    method,
    project,
    rootPath,
    pathPatterns,
    cacheManager,
    adapter = v30Adapter,
    allowedParamNames,
    wildcardParamName,
  } = options;
  const logPath = displayPath || routePath;
  const inputProp = type.getProperty("input");
  const input = inputProp
    ? typeChecker.getTypeOfSymbolAtLocation(inputProp, contextNode)
    : null;

  const sources = VALIDATOR_TARGETS.filter((t) => t !== "json" && t !== "form");
  const params: OpenAPIV3.ParameterObject[] = [];

  for (const src of sources) {
    const p = input ? input.getProperty(src) : undefined;
    if (!p && !(routePath && method && project && rootPath)) continue;

    // Attempt dynamic resolution for parameter schema
    let dynamicSchema: OpenAPIV3.SchemaObject | null = null;
    let mergedProperties: Record<
      string,
      OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
    > = {};
    let mergedRequired: string[] = [];

    if (routePath && method && project && rootPath) {
      const resolved = await resolveValidatorSchema(
        routePath,
        method,
        src,
        project,
        typeChecker,
        rootPath,
        cacheManager,
        adapter,
      );
      if (
        resolved &&
        resolved.schema &&
        typeof resolved.schema === "object" &&
        !("$ref" in resolved.schema)
      ) {
        if (resolved.schema.properties) {
          dynamicSchema = resolved.schema;
          mergedProperties = resolved.schema.properties;
          mergedRequired = Array.isArray(dynamicSchema.required)
            ? dynamicSchema.required
            : [];
          if (logPath) logger.record(method, logPath, src, resolved.library);
        } else if (resolved.schema.allOf) {
          dynamicSchema = resolved.schema;
          const reqSet = new Set<string>();
          for (const sub of resolved.schema.allOf) {
            if (typeof sub === "object" && !("$ref" in sub) && sub.properties) {
              Object.assign(mergedProperties, sub.properties);
              if (Array.isArray(sub.required)) {
                sub.required.forEach((r: string) => reqSet.add(r));
              }
            }
          }
          if (reqSet.size > 0) mergedRequired = Array.from(reqSet);
          if (logPath) logger.record(method, logPath, src, resolved.library);
        }
      }
    }

    if (dynamicSchema) {
      // Dynamic schema properties are the individual parameters
      for (const [key, propSchema] of Object.entries(mergedProperties)) {
        const schemaObj = propSchema as OpenAPIV3.SchemaObject;
        if (src === "param" && pathPatterns?.[key]) {
          schemaObj.pattern = pathPatterns[key];
          if (!schemaObj.type) schemaObj.type = "string";
        }

        const isArray = src === "query" && isArraySchema(schemaObj);

        params.push({
          name: key,
          in: src === "param" ? "path" : src,
          required: src === "param" ? true : mergedRequired.includes(key),
          schema: schemaObj,
          ...(isArray ? { style: "form", explode: true } : {}),
        });
      }
    } else if (p) {
      // Fallback: Use AST type inference
      const srcType = typeChecker.getTypeOfSymbolAtLocation(p, contextNode);
      const props = srcType.getProperties();
      if (props.length > 0 && logPath && method) {
        logger.record(method, logPath, src, "ts type");
      }
      for (const f of props) {
        const ft = typeChecker.getTypeOfSymbolAtLocation(f, contextNode);
        const name = f.getName();
        const schema = buildSchema({
          type: ft,
          typeChecker,
          contextNode,
          adapter,
        }) as OpenAPIV3.SchemaObject;

        if (src === "param" && pathPatterns?.[name]) {
          schema.pattern = pathPatterns[name];
          if (!schema.type) schema.type = "string";
        }

        const isArray = src === "query" && isArraySchema(schema);

        params.push({
          name,
          in: src === "param" ? "path" : src,
          required: src === "param" ? true : !f.isOptional(),
          schema,
          ...(isArray ? { style: "form", explode: true } : {}),
        });
      }
    }
  }

  if (allowedParamNames) {
    const allowedSet = new Set(allowedParamNames);
    // Filter out path parameters that are not in this path template
    const filteredParams = params.filter(
      (p) => p.in !== "path" || allowedSet.has(p.name),
    );

    // If the path template contains parameters (such as wildcard) not in params,
    // inject fallback string schema for OpenAPI compliance
    for (const pName of allowedParamNames) {
      const exists = filteredParams.some(
        (p) => p.in === "path" && p.name === pName,
      );
      if (!exists) {
        const isWildcard =
          pName.toLowerCase().includes("wildcard") ||
          Boolean(wildcardParamName && pName === wildcardParamName);
        const pattern = pathPatterns?.[pName];
        filteredParams.push({
          name: pName,
          in: "path",
          required: true,
          schema: pattern
            ? { type: "string", pattern }
            : { type: "string" },
          description: isWildcard
            ? "Catch-all wildcard path parameter"
            : undefined,
        });
      }
    }
    return filteredParams;
  }

  return params;
}
