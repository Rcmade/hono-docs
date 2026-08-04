// src/schema-resolver/routeIndex.ts
// Single-pass AST Route Indexer for high-speed O(1) route discovery
// and granular route dependency source mapping.

import { SyntaxKind, type Project, type CallExpression } from "ts-morph";
import { HONO_METHODS } from "../utils/constants";

export interface IndexedRoute {
  call: CallExpression;
  sourceFilePath: string;
  method: string;
  rawPath: string;
}

/**
 * Normalizes an OpenAPI-style path like `/users/{id}` back to Hono style `/users/:id`
 * so we can match it against the AST route strings.
 */
export function normalizeToHonoPath(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

class RouteASTIndex {
  private routes: IndexedRoute[] = [];
  private exactMap = new Map<string, IndexedRoute[]>();

  constructor(project: Project) {
    this.buildIndex(project);
  }

  private buildIndex(project: Project) {
    const quickCheckRegex = /\.(get|post|put|delete|patch|all|options|head)\s*\(/i;

    for (const sourceFile of project.getSourceFiles()) {
      const text = sourceFile.getFullText();
      // Ultra-fast pre-filter: skip files that obviously contain no Hono route declarations
      if (!quickCheckRegex.test(text)) {
        continue;
      }

      const filePath = sourceFile.getFilePath();
      const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

      for (const call of calls) {
        const expr = call.getExpression();
        if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue;

        const methodName = expr.getName();
        if (!HONO_METHODS.has(methodName)) continue;

        const args = call.getArguments();
        if (args.length === 0) continue;

        const firstArg = args[0];
        if (
          !firstArg.isKind(SyntaxKind.StringLiteral) &&
          !firstArg.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
        ) {
          continue;
        }

        const rawPath = firstArg.getText().replace(/^['"`]|['"`]$/g, "");
        const item: IndexedRoute = {
          call,
          sourceFilePath: filePath,
          method: methodName,
          rawPath,
        };

        this.routes.push(item);

        const key = `${methodName}:${rawPath}`;
        const existing = this.exactMap.get(key) || [];
        existing.push(item);
        this.exactMap.set(key, existing);
      }
    }
  }

  public locate(method: string, routePath: string): IndexedRoute | null {
    const targetPath = normalizeToHonoPath(routePath);
    const exactKey = `${method}:${targetPath}`;

    // 1. O(1) Exact match check first
    const exact = this.exactMap.get(exactKey);
    if (exact && exact.length > 0) {
      return exact[0];
    }
    // Try matching with "all" handler exact
    const allExact = this.exactMap.get(`all:${targetPath}`);
    if (allExact && allExact.length > 0) {
      return allExact[0];
    }

    // 2. Suffix matching with intelligent ranking (longest suffix + file path relevance scoring)
    const candidates: IndexedRoute[] = [];
    let rootFallback: IndexedRoute | null = null;

    for (const r of this.routes) {
      if (r.method !== method && r.method !== "all") continue;

      if (r.rawPath !== "/" && targetPath.endsWith(r.rawPath)) {
        candidates.push(r);
      } else if (
        r.rawPath === "/" &&
        !targetPath.includes(":") &&
        !targetPath.includes("{")
      ) {
        if (!rootFallback) {
          rootFallback = r;
        }
      }
    }

    if (candidates.length === 1) {
      return candidates[0];
    } else if (candidates.length > 1) {
      const targetSegments = targetPath.toLowerCase().split("/").filter(Boolean);
      candidates.sort((a, b) => {
        // Primary sort: prefer longer matching route suffix
        if (b.rawPath.length !== a.rawPath.length) {
          return b.rawPath.length - a.rawPath.length;
        }
        // Secondary sort: score by overlap between target path segments and source file path
        const scoreA = targetSegments.reduce((acc, seg) => acc + (a.sourceFilePath.toLowerCase().includes(seg) ? 1 : 0), 0);
        const scoreB = targetSegments.reduce((acc, seg) => acc + (b.sourceFilePath.toLowerCase().includes(seg) ? 1 : 0), 0);
        return scoreB - scoreA;
      });
      return candidates[0];
    }

    return rootFallback;
  }
}

const indexCache = new WeakMap<Project, RouteASTIndex>();

export function getProjectRouteIndex(project: Project): RouteASTIndex {
  let idx = indexCache.get(project);
  if (!idx) {
    idx = new RouteASTIndex(project);
    indexCache.set(project, idx);
  }
  return idx;
}

export function invalidateProjectIndex(project: Project) {
  indexCache.delete(project);
}

export function locateRouteEntry(
  method: string,
  routePath: string,
  project: Project,
): IndexedRoute | null {
  const index = getProjectRouteIndex(project);
  return index.locate(method, routePath);
}
