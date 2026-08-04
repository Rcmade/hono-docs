import { Project, SyntaxKind, ts } from "ts-morph";
import { HONO_METHODS } from "./constants";

import type { OpenAPIV3 } from "openapi-types";

export type ParsedJSDoc = {
  summary?: string;
  description?: string;
  tags?: string[];
  exclude?: boolean;
  responseHeaders?: Record<
    string,
    { name: string; schema: OpenAPIV3.HeaderObject }[]
  >;
};

export function extractJSDocs(project: Project): Map<string, ParsedJSDoc[]> {
  const map = new Map<string, ParsedJSDoc[]>();

  // 1. Build a map of router variable names to all prefixes they are mounted at
  const routeMounts = new Map<string, string[]>();
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFullText().includes(".route(")) continue;
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const expr = call.getExpression();
      if (
        expr.isKind(SyntaxKind.PropertyAccessExpression) &&
        expr.getName() === "route"
      ) {
        const args = call.getArguments();
        if (args.length === 2 && args[0].isKind(SyntaxKind.StringLiteral)) {
          // Trim whitespace and strip trailing slash from the prefix
          const prefix = args[0].getLiteralText().replace(/\/+$/, "");
          // Only handle simple identifier references (e.g. "authRoutes"), not "routes.auth"
          const routerVarRaw = args[1].getText().trim();
          if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(routerVarRaw)) {
            const existing = routeMounts.get(routerVarRaw) ?? [];
            routeMounts.set(routerVarRaw, [...existing, prefix]);
          }
        }
      }
    }
  }

  // 2. Extract JSDocs and apply prefixes if matched
  const quickCheckRegex = /\.(get|post|put|delete|patch|all|options|head)\s*\(/i;
  for (const sourceFile of project.getSourceFiles()) {
    if (!quickCheckRegex.test(sourceFile.getFullText())) continue;
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of calls) {
      const expr = call.getExpression();
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const name = expr.getName();
        if (HONO_METHODS.has(name)) {
          const args = call.getArguments();
          if (args.length > 0 && args[0].isKind(SyntaxKind.StringLiteral)) {
            const routePath = args[0].getLiteralText();

            const dotToken = expr.getChildAtIndex(1);
            if (dotToken) {
              const comments = dotToken.getLeadingCommentRanges();
              let comment = "";

              // Search backwards for the closest JSDoc block
              for (let i = comments.length - 1; i >= 0; i--) {
                const c = comments[i];
                if (c.getKind() === SyntaxKind.MultiLineCommentTrivia) {
                  const text = c.getText();
                  if (text.startsWith("/**") && !text.startsWith("/**/")) {
                    comment = text;
                    break;
                  }
                }
              }

              if (comment) {
                const tsCompiler = ts as unknown as {
                  parseIsolatedJSDocComment: (
                    content: string,
                    start?: number,
                    length?: number,
                  ) => { jsDoc?: ts.JSDoc } | undefined;
                };
                const jsdocBlock =
                  tsCompiler.parseIsolatedJSDocComment(comment);
                if (jsdocBlock && jsdocBlock.jsDoc) {
                  const doc = jsdocBlock.jsDoc;

                  const parsed: ParsedJSDoc = { tags: [] };

                  if (typeof doc.comment === "string" && doc.comment.trim()) {
                    const lines = doc.comment.trim().split("\n");
                    parsed.summary = lines[0].trim();
                    if (lines.length > 1) {
                      parsed.description = lines.slice(1).join("\n").trim();
                    }
                  }
                  doc.tags?.forEach((tag: ts.JSDocTag) => {
                    const tagName = tag.tagName.text;
                    const tagComment =
                      typeof tag.comment === "string" ? tag.comment.trim() : "";

                    if (tagName === "summary") {
                      parsed.summary = tagComment;
                    } else if (tagName === "description") {
                      parsed.description = tagComment;
                    } else if (tagName === "tag" && tagComment) {
                      parsed.tags!.push(tagComment);
                    } else if (
                      ["ignore", "exclude", "hide"].includes(tagName)
                    ) {
                      parsed.exclude = true;
                    } else if (
                      tagName.toLowerCase() === "responseheader" &&
                      tagComment
                    ) {
                      // Format: @responseHeader 200 X-RateLimit-Limit [integer] Max requests
                      const match = tagComment.match(
                        /^(\d{3})\s+([a-zA-Z0-9\-_]+)(?:\s+\[([a-zA-Z]+)\])?(?:\s+(.*))?$/,
                      );
                      if (match) {
                        const statusCode = match[1];
                        const headerName = match[2];
                        const type = match[3] || "string";
                        const description = match[4] || "";

                        if (!parsed.responseHeaders)
                          parsed.responseHeaders = {};
                        if (!parsed.responseHeaders[statusCode])
                          parsed.responseHeaders[statusCode] = [];

                        const headerObj: OpenAPIV3.HeaderObject = {
                          schema:
                            type === "array"
                              ? { type: "array", items: { type: "string" } }
                              : {
                                  type: type as OpenAPIV3.NonArraySchemaObjectType,
                                },
                        };
                        if (description) {
                          headerObj.description = description;
                        }

                        parsed.responseHeaders[statusCode].push({
                          name: headerName,
                          schema: headerObj,
                        });
                      }
                    }
                  });

                  // Hono path is something like "/user/:id", we must match what's generated in `generateOpenApi.ts`
                  // `generateOpenApi` replaces `:id` with `{id}`.
                  let openApiPath = routePath.replace(/:([^/]+)/g, "{$1}");

                  // Attempt to find if this route is part of a mounted sub-router.
                  // Walk up to the nearest VariableDeclaration to get the router variable name.
                  const varDecl = call.getFirstAncestorByKind(
                    SyntaxKind.VariableDeclaration,
                  );
                  if (varDecl) {
                    const routerName = varDecl.getName();
                    const prefixes = routeMounts.get(routerName);
                    if (prefixes && prefixes.length > 0) {
                      // Use the first mount prefix (most common case).
                      // If mounted at multiple paths, the suffix-match fallback in generateOpenApi handles it.
                      const prefix = prefixes[0];
                      openApiPath =
                        prefix + (openApiPath === "/" ? "" : openApiPath);
                    }
                  }

                  const key = `${name.toLowerCase()} ${openApiPath}`;

                  if (!map.has(key)) {
                    map.set(key, []);
                  }
                  map.get(key)!.push(parsed);

                  // If the router is mounted at multiple prefixes, also register under each additional prefix
                  if (varDecl) {
                    const prefixes2 = routeMounts.get(varDecl.getName());
                    if (prefixes2 && prefixes2.length > 1) {
                      const baseOpenApiPath = routePath.replace(
                        /:([^/]+)/g,
                        "{$1}",
                      );
                      for (const extraPrefix of prefixes2.slice(1)) {
                        const extraPath =
                          extraPrefix +
                          (baseOpenApiPath === "/" ? "" : baseOpenApiPath);
                        const extraKey = `${name.toLowerCase()} ${extraPath}`;
                        if (!map.has(extraKey)) map.set(extraKey, []);
                        map.get(extraKey)!.push(parsed);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return map;
}
