// src/schema-resolver/detectSchemaArg.ts
// Step 2: Given a Hono route CallExpression node, find the validation schema
// argument using type fingerprinting — name-agnostic.

import {
  SyntaxKind,
  type CallExpression,
  type Node,
  type TypeChecker,
} from "ts-morph";
import { detectLibrary } from "./detectLibrary";
import type { ValidatorLibrary, ValidatorTarget } from "../types/index";
import { VALIDATOR_TARGETS } from "../utils/constants";

export type DetectedSchema = {
  node: Node;
  library: ValidatorLibrary;
  /** The validator target: "json" | "form" | "query" | "param" | "header" | "cookie" */
  target: ValidatorTarget;
};

/**
 * Inspects all middleware arguments of a Hono route call expression and returns
 * all detected schema arguments with their libraries and targets.
 *
 * Handles:
 * - zValidator("json", schema)      → standard pattern
 * - myValidator("json", schema)     → custom-named validator
 * - myValidator(schema)             → no target string
 * - schema passed directly as arg   → inline schema
 * - Multiple validators on same route
 */
export function detectSchemaArgs(
  routeCall: CallExpression,
  typeChecker: TypeChecker,
): DetectedSchema[] {
  const results: DetectedSchema[] = [];

  // Route call args: [path, ...middlewares, handler]
  // Skip first (path string) and last (handler function)
  const args = routeCall.getArguments();
  if (args.length < 2) return results;

  const middlewareArgs = args.slice(1, -1);

  for (const arg of middlewareArgs) {
    // Pattern A: schema passed directly as argument (inline Zod/TypeBox/Valibot object)
    const directType = typeChecker.getTypeAtLocation(arg);
    const directLib = detectLibrary(directType);
    if (directLib !== "unsupported") {
      results.push({ node: arg, library: directLib, target: "json" });
      continue;
    }

    // Pattern B: middleware call expression — e.g. zValidator("json", schema), bodyParser(schema)
    if (arg.isKind(SyntaxKind.CallExpression)) {
      const middlewareCall = arg.asKindOrThrow(SyntaxKind.CallExpression);
      const innerArgs = middlewareCall.getArguments();

      let target: ValidatorTarget = "json"; // default target if none specified
      let schemaNode: Node | null = null;

      for (const innerArg of innerArgs) {
        // If arg is a string literal and matches a known target, record it
        if (innerArg.isKind(SyntaxKind.StringLiteral)) {
          const val = innerArg
            .getText()
            .replace(/^['"`]|['"`]$/g, "") as ValidatorTarget;
          if (VALIDATOR_TARGETS.includes(val)) {
            target = val;
            continue;
          }
        }

        // Otherwise check if it is a schema by type fingerprinting
        const innerType = typeChecker.getTypeAtLocation(innerArg);
        const lib = detectLibrary(innerType);
        if (lib !== "unsupported") {
          schemaNode = innerArg;
          results.push({ node: schemaNode, library: lib, target });
          break;
        }
      }
    }
  }

  return results;
}
