import { buildSchema } from "./buildSchema";
import type { OpenAPIV3 } from "openapi-types";
import { resolveValidatorSchema } from "../schema-resolver/index";
import { VALIDATOR_TARGETS } from "./constants";
import type { Project, Type, TypeChecker, Node } from "ts-morph";

export async function genParameters(
  type: Type,
  typeChecker: TypeChecker,
  contextNode: Node,
  routePath?: string,
  method?: string,
  project?: Project,
  rootPath?: string,
): Promise<OpenAPIV3.ParameterObject[]> {
  const inputProp = type.getProperty("input");
  if (!inputProp) return [];

  const input = typeChecker.getTypeOfSymbolAtLocation(inputProp, contextNode);
  if (!input) return [];

  const sources = VALIDATOR_TARGETS.filter((t) => t !== "json" && t !== "form");
  const params: OpenAPIV3.ParameterObject[] = [];

  for (const src of sources) {
    const p = input.getProperty(src);
    if (!p) continue;

    // Attempt dynamic resolution for parameter schema
    let dynamicSchema: OpenAPIV3.SchemaObject | null = null;
    let mergedProperties: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject> = {};
    let mergedRequired: string[] = [];
    
    if (routePath && method && project && rootPath) {
      const resolved = await resolveValidatorSchema(
        routePath,
        method,
        src,
        project,
        typeChecker,
        rootPath,
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
          mergedRequired = Array.isArray(dynamicSchema.required) ? dynamicSchema.required : [];
          console.log(
            `  ✨ [${method.toUpperCase()} ${routePath}] ${src} parameters enriched from ${resolved.library} (runtime)`,
          );
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
          console.log(
            `  ✨ [${method.toUpperCase()} ${routePath}] ${src} parameters enriched from ${resolved.library} (runtime)`,
          );
        }
      }
    }

    if (dynamicSchema) {
      // Dynamic schema properties are the individual parameters
      for (const [key, propSchema] of Object.entries(mergedProperties)) {
        params.push({
          name: key,
          in: src === "param" ? "path" : src,
          required: mergedRequired.includes(key),
          schema: propSchema as OpenAPIV3.SchemaObject,
        });
      }
    } else {
      // Fallback: Use AST type inference
      const srcType = typeChecker.getTypeOfSymbolAtLocation(p, contextNode);
      for (const f of srcType.getProperties()) {
        const ft = typeChecker.getTypeOfSymbolAtLocation(f, contextNode);
        params.push({
          name: f.getName(),
          in: src === "param" ? "path" : src,
          required: !f.isOptional(),
          schema: buildSchema(ft, typeChecker, contextNode),
        });
      }
    }
  }
  return params;
}
