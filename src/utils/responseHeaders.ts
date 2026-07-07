import { CallExpression, SyntaxKind } from "ts-morph";
import type { OpenAPIV3 } from "openapi-types";

export interface ParsedHeader {
  name: string;
  schema: OpenAPIV3.HeaderObject;
}

/**
 * Traverses a given route CallExpression to find `c.header(...)` calls
 * and extracts them into OpenAPI header configurations.
 */
export function extractASTHeaders(routeNode: CallExpression): ParsedHeader[] {
  const headers: ParsedHeader[] = [];

  // Get the callback function of the route
  // We only search within the arguments of the route call to avoid picking up
  // chained route definitions from the same expression.
  const args = routeNode.getArguments();

  for (const arg of args) {
    const descendants = arg.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const callExpr of descendants) {
      const expr = callExpr.getExpression();

      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const propAccess = expr;
        if (propAccess.getName() === "header") {
          const callArgs = callExpr.getArguments();

          if (callArgs.length >= 1) {
            const headerNameNode = callArgs[0];

            if (headerNameNode.isKind(SyntaxKind.StringLiteral)) {
              const headerName = headerNameNode.getLiteralText();

              const headerObj: OpenAPIV3.HeaderObject = {
                schema: { type: "string" },
              };

              // Extract example value if provided
              if (callArgs.length >= 2) {
                const valueNode = callArgs[1];
                if (valueNode.isKind(SyntaxKind.StringLiteral)) {
                  headerObj.example = valueNode.getLiteralText();
                }
              }

              headers.push({
                name: headerName,
                schema: headerObj,
              });
            }
          }
        }
      }
    }
  }

  return headers;
}
