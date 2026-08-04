// src/schema-resolver/locateRouteNode.ts
// Delegates route discovery to the single-pass RouteASTIndex for O(1) matching.

import type { Project, CallExpression } from "ts-morph";
import { locateRouteEntry } from "./routeIndex";

/**
 * Searches all source files in the ts-morph project for a Hono route call expression
 * matching the given HTTP method and route path using high-speed O(1) indexed lookup.
 *
 * Returns the matching CallExpression node or null if not found.
 */
export function locateRouteNode(
  method: string,
  routePath: string,
  project: Project,
): CallExpression | null {
  const entry = locateRouteEntry(method, routePath, project);
  return entry ? entry.call : null;
}
