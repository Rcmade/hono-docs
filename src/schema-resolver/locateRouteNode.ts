// src/schema-resolver/locateRouteNode.ts
// Step 1: Find the Hono route call expression in the AST that matches
// a given HTTP method + route path pair.

import { SyntaxKind, type Project, type CallExpression } from "ts-morph";

import { HONO_METHODS } from "../utils/constants";

/**
 * Normalizes an OpenAPI-style path like `/users/{id}` back to Hono style `/users/:id`
 * so we can match it against the AST route strings.
 */
function normalizeToHonoPath(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

/**
 * Searches all source files in the ts-morph project for a Hono route call expression
 * matching the given HTTP method and route path.
 *
 * Returns the matching CallExpression node or null if not found.
 */
export function locateRouteNode(
  method: string,
  routePath: string,
  project: Project,
): CallExpression | null {
  const targetPath = normalizeToHonoPath(routePath);

  for (const sourceFile of project.getSourceFiles()) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of calls) {
      const expr = call.getExpression();

      // Must be a property access: app.post, router.get, etc.
      if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue;

      const methodName = expr
        .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
        .getName();
      if (!HONO_METHODS.has(methodName)) continue;
      // Match the specific HTTP method, or "all" which catches every method
      if (methodName !== method && methodName !== "all") continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      // First argument must be a string literal representing the path
      const firstArg = args[0];
      if (
        !firstArg.isKind(SyntaxKind.StringLiteral) &&
        !firstArg.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
      )
        continue;

      const rawPath = firstArg.getText().replace(/^['"`]|['"`]$/g, "");

      // Match exact path, suffix match, or trailing slash handling
      if (
        rawPath === targetPath ||
        targetPath.endsWith(rawPath) ||
        (rawPath === "/" &&
          !targetPath.includes(":") &&
          !targetPath.includes("{"))
      ) {
        // If it's a bare "/", we accept the first matching method in the project.
        // In most well-structured APIs, a specific path like `/api/products`
        // maps to exactly one `.get("/")` in its sub-router.
        return call;
      }
    }
  }

  return null;
}
