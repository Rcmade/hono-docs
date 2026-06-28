import { buildSchema } from "./buildSchema";
import type { OpenAPIV3 } from "openapi-types";

export function genRequestBody(
  type: import("ts-morph").Type,
  typeChecker: import("ts-morph").TypeChecker,
  contextNode: import("ts-morph").Node
): OpenAPIV3.RequestBodyObject | null {
  const inpProp = type.getProperty("input");
  if (!inpProp) return null;
  const inp = typeChecker.getTypeOfSymbolAtLocation(inpProp, contextNode);
  if (!inp) return null;

  const content: { [media: string]: OpenAPIV3.MediaTypeObject } = {};
  
  const jProp = inp.getProperty("json");
  if (jProp) {
    const jType = typeChecker.getTypeOfSymbolAtLocation(jProp, contextNode);
    content["application/json"] = {
      schema: buildSchema(jType, typeChecker, contextNode),
    };
  }
  
  const fProp = inp.getProperty("form");
  if (fProp) {
    const fType = typeChecker.getTypeOfSymbolAtLocation(fProp, contextNode);
    content["multipart/form-data"] = {
      schema: buildSchema(fType, typeChecker, contextNode),
    };
  }
  
  return Object.keys(content).length ? { required: true, content } : null;
}
