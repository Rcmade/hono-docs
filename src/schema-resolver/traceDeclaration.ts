// src/schema-resolver/traceDeclaration.ts
// Step 3: Resolve a schema Node to its source variable declaration,
// following cross-file imports, barrel re-exports, and path aliases.
// ts-morph resolves tsconfig.paths automatically.

import { SyntaxKind, type Node } from "ts-morph";

export type TraceResult = {
  /** Absolute path to the file where the schema is defined */
  filePath: string;
  /** The export name of the schema variable (or "default" for default exports) */
  exportName: string;
};

/**
 * Traces a schema Node (which may be an identifier, call expression result, etc.)
 * to the file and export name of its source declaration.
 *
 * Handles:
 * - Named imports: `import { userSchema } from "./schemas"`
 * - Path alias imports: `import { userSchema } from "@/schemas/user"` (tsconfig.paths)
 * - Barrel re-exports: follows up to 5 hops
 * - Default imports: `import schema from "./schemas"`
 * - Inline expressions: returns null (cannot trace, use fallback)
 */
export function traceDeclaration(schemaNode: Node): TraceResult | null {
  try {
    // If the node is an identifier, resolve its symbol
    const symbol = schemaNode.isKind(SyntaxKind.Identifier)
      ? schemaNode.getSymbol()
      : (schemaNode.getType().getSymbol() ??
        schemaNode.getType().getAliasSymbol());

    if (!symbol) return null;

    // Follow aliases up to 5 hops (handles barrel re-exports)
    let resolved = symbol;
    for (let i = 0; i < 5; i++) {
      const aliased = resolved.getAliasedSymbol();
      if (!aliased) break;
      resolved = aliased;
    }

    const declarations = resolved.getDeclarations();
    if (!declarations.length) return null;

    const decl = declarations[0];
    const sourceFile = decl.getSourceFile();
    const filePath = sourceFile.getFilePath();

    // Determine the export name
    let exportName = "default";

    if (decl.isKind(SyntaxKind.VariableDeclaration)) {
      exportName = decl.getName();
    } else if (decl.isKind(SyntaxKind.ExportSpecifier)) {
      exportName = decl.getName();
    } else if (decl.isKind(SyntaxKind.ImportSpecifier)) {
      exportName = decl.getName();
    } else if (decl.isKind(SyntaxKind.BindingElement)) {
      exportName = decl.getName();
    }

    return { filePath, exportName };
  } catch {
    return null;
  }
}
