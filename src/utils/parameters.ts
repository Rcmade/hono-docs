import { buildSchema } from "./buildSchema";
import type { OpenAPIV3 } from "openapi-types";

export function genParameters(
  type: import("ts-morph").Type,
  typeChecker: import("ts-morph").TypeChecker,
  contextNode: import("ts-morph").Node
): OpenAPIV3.ParameterObject[] {
  const inputProp = type.getProperty("input");
  if (!inputProp) return [];
  
  const input = typeChecker.getTypeOfSymbolAtLocation(inputProp, contextNode);
  if (!input) return [];

  const sources = ["query", "param", "header", "cookie"];
  const params: OpenAPIV3.ParameterObject[] = [];
  
  for (const src of sources) {
    const p = input.getProperty(src);
    if (!p) continue;
    
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
  return params;
}
