import type { OpenAPIV3 } from "openapi-types";

export function sanitizeApiPrefix(prefix: string): string {
  return prefix
    .replace(/^\//, "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((seg, i) =>
      i === 0
        ? seg.toLowerCase()
        : seg[0].toUpperCase() + seg.slice(1).toLowerCase(),
    )
    .join("");
}

export function unwrapUnion(
  type: import("ts-morph").Type,
): import("ts-morph").Type[] {
  return type.isUnion() ? type.getUnionTypes() : [type];
}

export function normalizeImportPaths(typeText: string): string {
  return typeText.replace(/from ["'].*node_modules\/(.*)["']/g, `from "$1"`);
}

export function cleanDefaultResponse(
  operation: OpenAPIV3.OperationObject,
  pathKey: string,
  method: string,
) {
  const defaultResponse = operation.responses?.default;
  if (!defaultResponse) return;

  const defResp = defaultResponse as OpenAPIV3.ResponseObject;
  const desc = defResp.description ?? "";

  if (desc.includes("import(")) {
    const content = defResp.content;
    if (content && Object.keys(content).length > 0) {
      defResp.description = "Default fallback response";
    } else {
      delete operation.responses.default;
    }
  }
}

export function groupBy<T>(
  arr: T[],
  fn: (x: T) => string,
): Record<string, T[]> {
  return arr.reduce(
    (acc, x) => {
      (acc[fn(x)] ||= []).push(x);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export function generateDefaultSummary(
  httpMethod: string,
  routePath: string,
): string {
  // Normalize and split segments
  const cleanPath = routePath
    .replace(/^\/api(\/v\d+)?/i, "") // strip leading /api, /api/v1, /v1, etc.
    .replace(/\/+/g, "/") // normalize slashes
    .replace(/\/$/, ""); // strip trailing slash

  if (!cleanPath || cleanPath === "/") {
    const verb =
      httpMethod.toUpperCase() === "GET" ? "Get" : httpMethod.toUpperCase();
    return `${verb} Root`;
  }

  const segments = cleanPath.split("/").filter(Boolean);
  const words: string[] = [];

  // Determine prefix verb
  const method = httpMethod.toUpperCase();
  let verb = "Get";
  if (method === "POST") verb = "Create";
  else if (method === "PUT" || method === "PATCH") verb = "Update";
  else if (method === "DELETE") verb = "Delete";
  else verb = method.charAt(0) + method.slice(1).toLowerCase();

  words.push(verb);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // Check if it is a parameter like :id, :userId, {id}, {userId} or wildcard *
    if (
      seg.startsWith(":") ||
      (seg.startsWith("{") && seg.endsWith("}")) ||
      seg === "*"
    ) {
      let paramName = seg;
      if (seg.startsWith(":")) {
        paramName = seg.slice(1);
      } else if (seg.startsWith("{")) {
        paramName = seg.slice(1, -1);
      } else if (seg === "*") {
        paramName = "Wildcard";
      }

      // Remove regex constraints if any (e.g. id{[0-9]+})
      paramName = paramName.split("{")[0];
      // Strip any extra non-alphanumeric chars at the end (like ?)
      paramName = paramName.replace(/[^a-zA-Z0-9]+$/, "");

      // Format parameter name to title case
      const formattedParam = paramName.replace(/([A-Z])/g, " $1").trim();
      words.push(
        `By ${formattedParam.charAt(0).toUpperCase() + formattedParam.slice(1)}`,
      );
    } else {
      // Regular path segment: format camelCase or kebab-case/snake_case to friendly words
      const formattedSeg = seg
        .replace(/[-_]+/g, " ")
        .replace(/([A-Z])/g, " $1")
        .replace(/\s+/g, " ")
        .trim();

      words.push(formattedSeg.charAt(0).toUpperCase() + formattedSeg.slice(1));
    }
  }

  // Join words and normalize spaces
  return words.join(" ").replace(/\s+/g, " ").trim();
}
