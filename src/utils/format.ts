import type { OpenAPIV3 } from "openapi-types";
import {
  DEFAULT_WILDCARD_PARAM,
  PATH_PARAM_REGEX,
  WILDCARD_SEGMENT_REGEX,
} from "./constants";

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

export function cleanDefaultResponse(operation: OpenAPIV3.OperationObject) {
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
      (seg.startsWith("{") && (seg.endsWith("}") || seg.endsWith("}?"))) ||
      seg === "*"
    ) {
      let paramName = seg;
      if (seg.startsWith(":")) {
        paramName = seg.slice(1);
      } else if (seg.startsWith("{")) {
        paramName = seg.replace(/^\{/, "").replace(/\}\??$/, "");
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

export interface OpenApiTagObject {
  name: string;
  description?: string;
}

/**
 * Inserts a tag into an OpenAPI tags array or enriches an existing tag's description without duplicates.
 */
export function addTagToSpec(
  tags: OpenApiTagObject[],
  tag: OpenApiTagObject,
): void {
  const existing = tags.find((item) => item.name === tag.name);
  if (!existing) {
    tags.push(tag);
  } else if (!existing.description && tag.description) {
    existing.description = tag.description;
  }
}

/**
 * Strips all single, double, or backtick quotes anywhere in a string.
 */
export function stripAllQuotes(str: string): string {
  return str.replace(/['"`]/g, "").trim();
}

/**
 * Strips outermost enclosing single, double, or backtick quotes from a string.
 */
export function stripQuotes(str: string): string {
  return str.replace(/^['"`]|['"`]$/g, "").trim();
}

/**
 * Converts a raw Hono route path (including regex constraints and parameters)
 * to an OpenAPI 3.0 path template. E.g. "/archive/:year{[0-9]{4}}" -> "/archive/{year}"
 * Also converts wildcard segments "*" to "{wildcard}" (or custom name) and cleans optional markers.
 */
export function toOpenApiPath(
  pathStr: string,
  options?: { wildcardParam?: string },
): string {
  const wildcardParam = options?.wildcardParam || DEFAULT_WILDCARD_PARAM;
  const replacedParams = pathStr.replace(PATH_PARAM_REGEX, "{$1}");

  const wildcardRegex = new RegExp(WILDCARD_SEGMENT_REGEX.source, "g");
  const matches = replacedParams.match(wildcardRegex);
  if (!matches) return replacedParams;
  const totalWildcards = matches.length;
  let wildcardIndex = 0;

  return replacedParams.replace(wildcardRegex, (match) => {
    wildcardIndex++;
    const name =
      totalWildcards > 1 ? `${wildcardParam}${wildcardIndex}` : wildcardParam;
    return match.startsWith("/") ? `/{${name}}` : `{${name}}`;
  });
}

export interface ExpandedPath {
  path: string;
  paramNames: string[];
}

/**
 * Expands a Hono route path into one or more valid OpenAPI 3.0 path templates.
 *
 * If the route contains optional path parameters (e.g. `/:id/files/:name?`),
 * this expands into multiple paths:
 * - `/{id}/files` (parameters: `["id"]`)
 * - `/{id}/files/{name}` (parameters: `["id", "name"]`)
 *
 * If the route contains wildcard segments `/*`, they are converted to `{wildcard}`
 * (or a custom configured parameter name).
 */
export function expandHonoPath(
  rawPath: string,
  options?: { wildcardParam?: string },
): ExpandedPath[] {
  const wildcardParam = options?.wildcardParam || DEFAULT_WILDCARD_PARAM;

  let p = stripQuotes(rawPath);
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

  const segments = p.split("/").slice(1);
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "")) {
    return [{ path: "/", paramNames: [] }];
  }

  const totalWildcards = segments.filter((s) => s === "*").length;
  let wildcardIndex = 0;

  interface SegmentInfo {
    raw: string;
    isOptional: boolean;
    openApiSeg: string;
    paramNames: string[];
  }

  const parsedSegments: SegmentInfo[] = segments.map((seg) => {
    if (seg === "*") {
      wildcardIndex++;
      const paramName =
        totalWildcards > 1
          ? `${wildcardParam}${wildcardIndex}`
          : wildcardParam;
      return {
        raw: seg,
        isOptional: false,
        openApiSeg: `{${paramName}}`,
        paramNames: [paramName],
      };
    }

    if (seg.includes(":")) {
      const paramMatches = Array.from(
        seg.matchAll(new RegExp(PATH_PARAM_REGEX.source, "g")),
      );
      const isOptional = paramMatches.some(
        (m) => m[0].endsWith("?") || m[0].includes("?{"),
      );
      const openApiSeg = toOpenApiPath(seg, { wildcardParam });
      const matches = Array.from(openApiSeg.matchAll(/\{([^}]+)\}/g));
      const paramNames = matches.map((m) => m[1]);
      return {
        raw: seg,
        isOptional,
        openApiSeg,
        paramNames,
      };
    }

    return {
      raw: seg,
      isOptional: false,
      openApiSeg: seg,
      paramNames: [],
    };
  });

  const hasOptional = parsedSegments.some((s) => s.isOptional);
  if (!hasOptional) {
    const fullPath = "/" + parsedSegments.map((s) => s.openApiSeg).join("/");
    const paramNames = parsedSegments.flatMap((s) => s.paramNames);
    return [{ path: fullPath, paramNames }];
  }

  const results: ExpandedPath[] = [];
  const seenPaths = new Set<string>();

  function addResult(activeSegments: SegmentInfo[]) {
    const fullPath =
      activeSegments.length === 0
        ? "/"
        : "/" + activeSegments.map((s) => s.openApiSeg).join("/");
    if (!seenPaths.has(fullPath)) {
      seenPaths.add(fullPath);
      const paramNames = activeSegments.flatMap((s) => s.paramNames);
      results.push({ path: fullPath, paramNames });
    }
  }

  // Only permit early route termination before an optional segment
  // if all subsequent segments are also optional
  for (let i = 0; i < parsedSegments.length; i++) {
    if (
      parsedSegments[i].isOptional &&
      parsedSegments.slice(i).every((s) => s.isOptional)
    ) {
      addResult(parsedSegments.slice(0, i));
    }
  }
  addResult(parsedSegments);

  return results;
}

/**
 * Extracts parameter names and their custom regex constraints from a Hono route path.
 */
export function extractPathParamPatterns(
  rawPath: string,
): Record<string, string> {
  const patterns: Record<string, string> = {};
  const extractor = new RegExp(PATH_PARAM_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = extractor.exec(rawPath)) !== null) {
    if (match[2]) {
      patterns[match[1]] = match[2];
    }
  }
  return patterns;
}
