import { Project, SyntaxKind, ts } from "ts-morph";

export type ParsedJSDoc = {
  summary?: string;
  description?: string;
  tags?: string[];
};

export function extractJSDocs(
  project: Project,
): Map<string, ParsedJSDoc[]> {
  const map = new Map<string, ParsedJSDoc[]>();

  // 1. Build a map of router variable names to their mounted prefixes
  const routeMounts = new Map<string, string>();
  for (const sourceFile of project.getSourceFiles()) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const expr = call.getExpression();
      if (expr.isKind(SyntaxKind.PropertyAccessExpression) && expr.getName() === "route") {
        const args = call.getArguments();
        if (args.length === 2 && args[0].isKind(SyntaxKind.StringLiteral)) {
          const prefix = args[0].getLiteralText();
          const routerVar = args[1].getText();
          routeMounts.set(routerVar, prefix);
        }
      }
    }
  }

  // 2. Extract JSDocs and apply prefixes if matched
  for (const sourceFile of project.getSourceFiles()) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of calls) {
      const expr = call.getExpression();
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const name = expr.getName();
        if (["get", "post", "put", "delete", "patch"].includes(name)) {
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
                const jsdocBlock = tsCompiler.parseIsolatedJSDocComment(comment);
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
                    }
                  });

                  // Hono path is something like "/user/:id", we must match what's generated in `generateOpenApi.ts`
                  // `generateOpenApi` replaces `:id` with `{id}`.
                  let openApiPath = routePath.replace(/:([^/]+)/g, "{$1}");
                  
                  // Attempt to find if this route is part of a mounted sub-router
                  const varDecl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
                  if (varDecl) {
                    const routerName = varDecl.getName();
                    if (routeMounts.has(routerName)) {
                      const prefix = routeMounts.get(routerName)!;
                      openApiPath = prefix + (openApiPath === "/" ? "" : openApiPath);
                    }
                  }

                  const key = `${name.toLowerCase()} ${openApiPath}`;
                  
                  if (!map.has(key)) {
                    map.set(key, []);
                  }
                  map.get(key)!.push(parsed);
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
