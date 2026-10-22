import {
  SyntaxKind,
  ts,
  type Node,
  type Project,
  type CallExpression,
} from "ts-morph";
import {
  HONO_METHODS,
  ROUTER_CONSTANTS,
  JSDOC_TAGS,
  JSDOC_REGEXES,
} from "./constants";
import { toOpenApiPath, stripQuotes } from "./format";
import type { OpenAPIV3 } from "openapi-types";

export interface ParsedJSDoc {
  summary?: string;
  description?: string;
  tags?: string[];
  exclude?: boolean;
  deprecated?: boolean | string;
  examples?: Array<{ statusCode?: string; value: unknown }>;
  responseDescriptions?: Record<string, string>;
  responseHeaders?: Record<
    string,
    Array<{ name: string; schema: OpenAPIV3.HeaderObject }>
  >;
  sourceFilePaths?: string[];
}

export class JSDocMap extends Map<string, ParsedJSDoc[]> {
  /** Map of tag name to tag description extracted from JSDoc */
  public tagMetadata = new Map<string, string>();

  /**
   * Appends a ParsedJSDoc object for a given method + path key.
   */
  public addDoc(key: string, doc: ParsedJSDoc): void {
    const list = this.get(key) ?? [];
    list.push(doc);
    this.set(key, list);
  }
}

interface RouterDefinition {
  id: string;
  sourceFilePath: string;
  varName?: string;
  tags: string[];
  description?: string;
  deprecated?: boolean;
  exclude?: boolean;
}

interface RouterMountEdge {
  sourceFilePath: string;
  parentRouterId: string;
  childRouterId: string;
  prefix: string;
  mountTags: string[];
  description?: string;
  deprecated?: boolean;
  exclude?: boolean;
}

interface MountChainInfo {
  prefix: string;
  tags: string[];
  deprecated: boolean;
  exclude: boolean;
  sourceFilePaths: string[];
}

/**
 * Normalizes a URL path prefix: strips trailing slash, ensures leading slash unless empty,
 * and converts :param to {param} for OpenAPI consistency.
 */
function normalizePathPrefix(rawPrefix: string): string {
  let clean = stripQuotes(rawPrefix).replace(/\/+$/, "");
  if (clean && !clean.startsWith("/")) {
    clean = "/" + clean;
  }
  return toOpenApiPath(clean);
}

/**
 * Concatenates two path segments cleanly without double slashes.
 */
function joinOpenApiPaths(prefix: string, subPath: string): string {
  const normSub = toOpenApiPath(subPath);
  if (!prefix || prefix === "/") {
    return normSub.startsWith("/") ? normSub : `/${normSub}`;
  }
  if (!normSub || normSub === "/") {
    return prefix.startsWith("/") ? prefix : `/${prefix}`;
  }
  const cleanPrefix = prefix.replace(/\/+$/, "");
  const cleanSub = normSub.replace(/^\/+/, "");
  return `${cleanPrefix}/${cleanSub}`;
}

/**
 * Strips quotes and whitespace from tag names.
 */
function sanitizeTagName(tag: string): string {
  return stripQuotes(tag);
}

/**
 * Extracts the outermost leading JSDoc block comment text from an AST node.
 */
function getLeadingJSDocText(node: Node): string | null {
  const comments = node.getLeadingCommentRanges();
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.getKind() === SyntaxKind.MultiLineCommentTrivia) {
      const text = c.getText();
      if (text.startsWith("/**") && !text.startsWith("/**/")) {
        return text;
      }
    }
  }
  return null;
}

/**
 * Parses raw JSDoc comment text into a structured ParsedJSDoc object.
 */
export function parseJSDocText(comment: string): ParsedJSDoc | null {
  if (!comment || !comment.startsWith("/**")) return null;

  const tsCompiler = ts as unknown as {
    parseIsolatedJSDocComment: (
      content: string,
      start?: number,
      length?: number,
    ) => { jsDoc?: ts.JSDoc } | undefined;
  };
  const jsdocBlock = tsCompiler.parseIsolatedJSDocComment(comment);
  if (!jsdocBlock?.jsDoc) return null;

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
    const tagName = tag.tagName.text.toLowerCase();
    const tagComment =
      typeof tag.comment === "string" ? tag.comment.trim() : "";

    if (tagName === JSDOC_TAGS.summary) {
      parsed.summary = tagComment;
    } else if (tagName === JSDOC_TAGS.description) {
      parsed.description = tagComment;
    } else if (tagName === JSDOC_TAGS.tag || tagName === JSDOC_TAGS.tags) {
      if (tagComment) {
        const descMatch = tagComment.match(JSDOC_REGEXES.tagWithDescription);
        if (descMatch) {
          const resolvedTag = sanitizeTagName(descMatch[1].trim());
          if (resolvedTag && !parsed.tags!.includes(resolvedTag)) {
            parsed.tags!.push(resolvedTag);
          }
          if (!parsed.description) {
            parsed.description = descMatch[2].trim();
          }
        } else {
          const parts = tagComment
            .split(",")
            .map(sanitizeTagName)
            .filter(Boolean);
          for (const part of parts) {
            if (!parsed.tags!.includes(part)) {
              parsed.tags!.push(part);
            }
          }
        }
      }
    } else if (
      tagName === JSDOC_TAGS.ignore ||
      tagName === JSDOC_TAGS.exclude ||
      tagName === JSDOC_TAGS.hide
    ) {
      parsed.exclude = true;
    } else if (tagName === JSDOC_TAGS.deprecated) {
      parsed.deprecated = tagComment || true;
    } else if (tagName === JSDOC_TAGS.example && tagComment) {
      if (!parsed.examples) parsed.examples = [];
      let statusCode: string | undefined;
      let rawContent = tagComment;
      const statusMatch = rawContent.match(JSDOC_REGEXES.example);
      if (statusMatch) {
        statusCode = statusMatch[1];
        rawContent = statusMatch[2].trim();
      }
      let value: unknown = rawContent;
      try {
        value = JSON.parse(rawContent);
      } catch {
        // Fall back to raw string if not JSON
      }
      parsed.examples.push({ statusCode, value });
    } else if (
      (tagName === JSDOC_TAGS.responseDescription ||
        tagName === JSDOC_TAGS.responseDescriptionUnderscore ||
        tagName === JSDOC_TAGS.response) &&
      tagComment
    ) {
      const match = tagComment.match(JSDOC_REGEXES.responseDescription);
      if (match) {
        const statusCode = match[1];
        const desc = match[2].trim();
        if (!parsed.responseDescriptions) parsed.responseDescriptions = {};
        parsed.responseDescriptions[statusCode] = desc;
      }
    } else if (tagName === JSDOC_TAGS.responseHeader && tagComment) {
      const match = tagComment.match(JSDOC_REGEXES.responseHeader);
      if (match) {
        const statusCode = match[1];
        const headerName = match[2];
        const type = match[3] || "string";
        const description = match[4] || "";
        if (!parsed.responseHeaders) parsed.responseHeaders = {};
        if (!parsed.responseHeaders[statusCode]) {
          parsed.responseHeaders[statusCode] = [];
        }
        const headerObj: OpenAPIV3.HeaderObject = {
          schema:
            type === "array"
              ? { type: "array", items: { type: "string" } }
              : { type: type as OpenAPIV3.NonArraySchemaObjectType },
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

  return parsed;
}

/**
 * Deduplicates an array of tags while strictly preserving insertion order.
 */
function deduplicateTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Resolves a ts-morph node or symbol down to its root source declaration,
 * unwrapping aliases (imports, re-exports, barrel files).
 */
function resolveRootDeclaration(node: Node): Node {
  let sym = node.getSymbol();
  if (!sym) return node;
  while (sym.getAliasedSymbol()) {
    sym = sym.getAliasedSymbol()!;
  }
  const decls = sym.getDeclarations();
  if (decls.length === 0) return node;

  let decl = decls[0];
  // Unwrap variable reassignments (e.g. `export const projectsRoutes = app;`)
  const visited = new Set<Node>();
  while (decl && decl.isKind(SyntaxKind.VariableDeclaration)) {
    if (visited.has(decl)) break;
    visited.add(decl);
    const init = decl.getInitializer();
    if (init && init.isKind(SyntaxKind.Identifier)) {
      const initSym = init.getSymbol();
      if (initSym) {
        let s = initSym;
        while (s.getAliasedSymbol()) s = s.getAliasedSymbol()!;
        const initDecls = s.getDeclarations();
        if (initDecls.length > 0 && initDecls[0] !== decl) {
          decl = initDecls[0];
          continue;
        }
      }
    }
    break;
  }
  return decl;
}

/**
 * Formats an inline router identity ID.
 */
function getInlineRouterId(filePath: string, startPos: number): string {
  return `${filePath}:${ROUTER_CONSTANTS.inlineRouterPrefix}${startPos}`;
}

/**
 * Returns a normalized router identity (source file path and identifier name)
 * for any supported AST declaration node.
 */
function getRouterIdentityFromNode(node: Node): {
  filePath: string;
  name: string;
} {
  const filePath = node.getSourceFile().getFilePath();
  if (
    node.isKind(SyntaxKind.VariableDeclaration) ||
    node.isKind(SyntaxKind.PropertyAssignment)
  ) {
    return { filePath, name: node.getName() };
  }
  if (node.isKind(SyntaxKind.ExportAssignment)) {
    return { filePath, name: ROUTER_CONSTANTS.defaultRouterName };
  }
  if (
    node.isKind(SyntaxKind.FunctionDeclaration) ||
    node.isKind(SyntaxKind.MethodDeclaration)
  ) {
    const name = node.getName() || "anonymous";
    return {
      filePath,
      name: `${ROUTER_CONSTANTS.functionRouterPrefix}${name}`,
    };
  }
  return { filePath, name: node.getText().trim() };
}

/**
 * Unwraps chained method calls (.use(), .route(), .get(), etc.) to the root receiver node.
 */
function getRootReceiver(callExpr: Node): Node {
  let curr = callExpr;
  while (curr.isKind(SyntaxKind.CallExpression)) {
    const expr = curr.getExpression();
    if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
      curr = expr.getExpression();
    } else {
      break;
    }
  }
  return curr;
}

/**
 * Resolves the enclosing router identity ID `${filePath}:${name}` for any route or mount call.
 */
function resolveEnclosingRouterId(call: CallExpression): string {
  const containerNode = call.getFirstAncestor(
    (node: Node) =>
      node.isKind(SyntaxKind.PropertyAssignment) ||
      node.isKind(SyntaxKind.VariableDeclaration) ||
      node.isKind(SyntaxKind.FunctionDeclaration) ||
      node.isKind(SyntaxKind.ExportAssignment),
  );

  const targetNode = containerNode
    ? containerNode
    : resolveRootDeclaration(getRootReceiver(call));

  const ident = getRouterIdentityFromNode(targetNode);
  return `${ident.filePath}:${ident.name}`;
}

/**
 * Checks whether a route call is contained directly within an inline .route() mount argument.
 */
function findEnclosingInlineMount(call: CallExpression): CallExpression | null {
  for (const ancestor of call.getAncestors()) {
    if (ancestor.isKind(SyntaxKind.CallExpression)) {
      const expr = ancestor.getExpression();
      if (
        expr.isKind(SyntaxKind.PropertyAccessExpression) &&
        expr.getName() === ROUTER_CONSTANTS.routeMethod
      ) {
        const args = ancestor.getArguments();
        if (
          args.length >= 2 &&
          (args[1] === call ||
            (call.getStart() >= args[1].getStart() &&
              call.getEnd() <= args[1].getEnd()))
        ) {
          return ancestor;
        }
      }
    }
  }
  return null;
}

/**
 * Registers a discovered router node into the definition map and collects its tag metadata.
 */
function registerRouterDeclaration(
  node: Node,
  ident: { filePath: string; name: string },
  routerDefinitions: Map<string, RouterDefinition>,
  tagMetadata: Map<string, string>,
): void {
  const routerId = `${ident.filePath}:${ident.name}`;
  if (routerDefinitions.has(routerId)) return;

  const commentNode = node.isKind(SyntaxKind.VariableDeclaration)
    ? (node.getFirstAncestorByKind(SyntaxKind.VariableStatement) ?? node)
    : node;
  const commentText = getLeadingJSDocText(commentNode);
  const parsed = commentText ? parseJSDocText(commentText) : null;

  routerDefinitions.set(routerId, {
    id: routerId,
    sourceFilePath: ident.filePath,
    varName: ident.name,
    tags: parsed?.tags ?? [],
    description: parsed?.description,
    deprecated: !!parsed?.deprecated,
    exclude: parsed?.exclude ?? false,
  });

  if (parsed?.tags && parsed.description) {
    for (const t of parsed.tags) {
      if (!tagMetadata.has(t)) {
        tagMetadata.set(t, parsed.description);
      }
    }
  }
}

/**
 * Creates a default single-hop mount chain info.
 */
function createDefaultMountChain(
  routerDef?: RouterDefinition,
): MountChainInfo[] {
  return [
    {
      prefix: "",
      tags: routerDef?.tags ?? [],
      deprecated: routerDef?.deprecated ?? false,
      exclude: routerDef?.exclude ?? false,
      sourceFilePaths: routerDef ? [routerDef.sourceFilePath] : [],
    },
  ];
}

/**
 * Extracts all JSDoc annotations across all files in the project,
 * resolving router declarations, mount points, nested router inheritance,
 * and route handler comments into an exact-path indexed map.
 */
export function extractJSDocs(project: Project): JSDocMap {
  const result = new JSDocMap();

  // Registry of all router definitions keyed by `${filePath}:${varName}`
  const routerDefinitions = new Map<string, RouterDefinition>();
  // List of all .route() mount connections
  const mountEdges: RouterMountEdge[] = [];

  // ── PASS 1: Identify All Router Declarations & JSDocs ───────────────────────
  for (const sourceFile of project.getSourceFiles()) {
    const text = sourceFile.getFullText();
    if (
      !text.includes(ROUTER_CONSTANTS.honoIdentifier) &&
      !text.includes(`.${ROUTER_CONSTANTS.routeMethod}(`)
    ) {
      continue;
    }

    // 1A. Variable Declarations (const / let / var)
    for (const varDecl of sourceFile.getVariableDeclarations()) {
      registerRouterDeclaration(
        varDecl,
        getRouterIdentityFromNode(varDecl),
        routerDefinitions,
        result.tagMetadata,
      );
    }

    // 1B. Export Assignments (export default new Hono())
    for (const exportAssign of sourceFile.getDescendantsOfKind(
      SyntaxKind.ExportAssignment,
    )) {
      registerRouterDeclaration(
        exportAssign,
        getRouterIdentityFromNode(exportAssign),
        routerDefinitions,
        result.tagMetadata,
      );
    }

    // 1C. Property Assignments ({ auth: new Hono() })
    for (const propAssign of sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAssignment,
    )) {
      registerRouterDeclaration(
        propAssign,
        getRouterIdentityFromNode(propAssign),
        routerDefinitions,
        result.tagMetadata,
      );
    }

    // 1D. Function Declarations (function createCrud() { return new Hono()... })
    for (const funcDecl of sourceFile.getFunctions()) {
      if (!funcDecl.getName()) continue;
      registerRouterDeclaration(
        funcDecl,
        getRouterIdentityFromNode(funcDecl),
        routerDefinitions,
        result.tagMetadata,
      );
    }
  }

  // ── PASS 2: Discover All .route() Mount Connections ────────────────────────
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFullText().includes(`.${ROUTER_CONSTANTS.routeMethod}(`))
      continue;

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const expr = call.getExpression();
      if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue;
      if (expr.getName() !== ROUTER_CONSTANTS.routeMethod) continue;

      const args = call.getArguments();
      if (args.length < 2) continue;

      // Extract mount prefix
      const prefix = normalizePathPrefix(args[0].getText());

      // Extract mount-point JSDoc on the .route dot token
      const dotToken = expr.getChildAtIndex(1);
      const mountComment = dotToken ? getLeadingJSDocText(dotToken) : null;
      const mountParsed = mountComment ? parseJSDocText(mountComment) : null;
      const mountTags = mountParsed?.tags ?? [];

      if (mountParsed?.tags && mountParsed.description) {
        for (const t of mountParsed.tags) {
          if (!result.tagMetadata.has(t)) {
            result.tagMetadata.set(t, mountParsed.description);
          }
        }
      }

      // Determine child router identity
      const targetArg = args[1];
      let childRouterId = "";
      if (
        targetArg.isKind(SyntaxKind.CallExpression) ||
        targetArg.isKind(SyntaxKind.NewExpression)
      ) {
        let funcDecl: Node | null = null;
        if (targetArg.isKind(SyntaxKind.CallExpression)) {
          const calleeSym = targetArg.getExpression().getSymbol();
          if (calleeSym) {
            let s = calleeSym;
            while (s.getAliasedSymbol()) s = s.getAliasedSymbol()!;
            const decls = s.getDeclarations();
            if (decls.length > 0) {
              const d = decls[0];
              if (
                d.isKind(SyntaxKind.FunctionDeclaration) ||
                d.isKind(SyntaxKind.VariableDeclaration)
              ) {
                funcDecl = d;
              }
            }
          }
        }

        if (funcDecl) {
          const ident = getRouterIdentityFromNode(funcDecl);
          childRouterId = `${ident.filePath}:${ident.name}`;
          if (!routerDefinitions.has(childRouterId)) {
            routerDefinitions.set(childRouterId, {
              id: childRouterId,
              sourceFilePath: ident.filePath,
              varName: ident.name,
              tags: [],
              deprecated: false,
              exclude: false,
            });
          }
        } else {
          // Inline anonymous sub-router: create a synthetic router node
          childRouterId = getInlineRouterId(
            sourceFile.getFilePath(),
            targetArg.getStart(),
          );
          routerDefinitions.set(childRouterId, {
            id: childRouterId,
            sourceFilePath: sourceFile.getFilePath(),
            varName: ROUTER_CONSTANTS.inlineRouterName,
            tags: mountTags,
            description: mountParsed?.description,
            deprecated: !!mountParsed?.deprecated,
            exclude: mountParsed?.exclude ?? false,
          });
        }
      } else {
        // Named router argument: unwrap aliases through barrel files
        const rootDecl = resolveRootDeclaration(targetArg);
        const ident = getRouterIdentityFromNode(rootDecl);
        childRouterId = `${ident.filePath}:${ident.name}`;
      }

      // Determine parent router identity
      const parentRouterId = resolveEnclosingRouterId(call);

      mountEdges.push({
        sourceFilePath: sourceFile.getFilePath(),
        parentRouterId,
        childRouterId,
        prefix,
        mountTags,
        description: mountParsed?.description,
        deprecated: !!mountParsed?.deprecated,
        exclude: mountParsed?.exclude ?? false,
      });
    }
  }

  // ── PASS 3: Build Mount Graph & Resolve Path/Tag Inheritance ────────────────
  const childToParents = new Map<string, RouterMountEdge[]>();
  for (const edge of mountEdges) {
    const list = childToParents.get(edge.childRouterId) ?? [];
    list.push(edge);
    childToParents.set(edge.childRouterId, list);
  }

  function getRouterMountChains(
    routerId: string,
    visited = new Set<string>(),
  ): MountChainInfo[] {
    const self = routerDefinitions.get(routerId);
    const selfTags = self?.tags ?? [];
    const selfDeprecated = self?.deprecated ?? false;
    const selfExclude = self?.exclude ?? false;
    const defaultChain = createDefaultMountChain(self);

    const parents = childToParents.get(routerId);
    if (!parents || parents.length === 0) {
      return defaultChain;
    }

    if (visited.has(routerId)) {
      return defaultChain;
    }
    visited.add(routerId);

    const results: MountChainInfo[] = [];

    for (const parentEdge of parents) {
      const parentChains = getRouterMountChains(
        parentEdge.parentRouterId,
        new Set(visited),
      );

      for (const pChain of parentChains) {
        const combinedPrefix = joinOpenApiPaths(
          pChain.prefix,
          parentEdge.prefix,
        );
        const combinedTags = deduplicateTags([
          ...pChain.tags,
          ...parentEdge.mountTags,
          ...selfTags,
        ]);
        const combinedDeprecated =
          pChain.deprecated || parentEdge.deprecated || selfDeprecated;
        const combinedExclude =
          pChain.exclude || parentEdge.exclude || selfExclude;
        const combinedSourceFiles = Array.from(
          new Set([
            ...pChain.sourceFilePaths,
            parentEdge.sourceFilePath,
            ...(self ? [self.sourceFilePath] : []),
          ]),
        );

        results.push({
          prefix: combinedPrefix,
          tags: combinedTags,
          deprecated: combinedDeprecated,
          exclude: combinedExclude,
          sourceFilePaths: combinedSourceFiles,
        });
      }
    }

    return results.length > 0 ? results : defaultChain;
  }

  // ── PASS 4: Extract Route Handlers & Apply Tags & Exact Paths ───────────────
  for (const sourceFile of project.getSourceFiles()) {
    if (!JSDOC_REGEXES.routeMethodQuickCheck.test(sourceFile.getFullText()))
      continue;

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const expr = call.getExpression();
      if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue;

      const methodName = expr.getName().toLowerCase();
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

      const rawRoutePath = stripQuotes(firstArg.getText());
      const openApiSubPath = toOpenApiPath(rawRoutePath);

      // 4A. Extract direct JSDoc from route call
      const dotToken = expr.getChildAtIndex(1);
      let routeComment = dotToken ? getLeadingJSDocText(dotToken) : null;

      // 4B. Check external handler function declaration if no inline route comment
      if (!routeComment && args.length > 1) {
        const lastArg = args[args.length - 1];
        if (lastArg.isKind(SyntaxKind.Identifier)) {
          const rootHandler = resolveRootDeclaration(lastArg);
          const funcComment = getLeadingJSDocText(rootHandler);
          if (funcComment) {
            routeComment = funcComment;
          }
        }
      }

      const directParsed = routeComment ? parseJSDocText(routeComment) : null;

      // 4C. Determine enclosing router identity
      const inlineMount = findEnclosingInlineMount(call);
      const enclosingRouterId = inlineMount
        ? getInlineRouterId(
            sourceFile.getFilePath(),
            inlineMount.getArguments()[1].getStart(),
          )
        : resolveEnclosingRouterId(call);

      // 4D. Retrieve all mount chains (paths and accumulated tags) for this router
      const chains = enclosingRouterId
        ? getRouterMountChains(enclosingRouterId)
        : createDefaultMountChain();

      // 4E. Register JSDoc under each full mounted path and fallback keys
      for (const chain of chains) {
        const fullMountedPath = joinOpenApiPaths(chain.prefix, openApiSubPath);
        const combinedTags = deduplicateTags([
          ...chain.tags,
          ...(directParsed?.tags ?? []),
        ]);
        const isDeprecated =
          directParsed?.deprecated ?? (chain.deprecated ? true : undefined);
        const isExcluded = directParsed?.exclude || chain.exclude;

        const combinedDocFiles = Array.from(
          new Set([sourceFile.getFilePath(), ...chain.sourceFilePaths]),
        );

        const effectiveParsed: ParsedJSDoc = {
          ...directParsed,
          tags: combinedTags.length > 0 ? combinedTags : directParsed?.tags,
          deprecated: isDeprecated,
          exclude: isExcluded,
          sourceFilePaths: combinedDocFiles,
        };

        // Primary: Exact full mounted path key (e.g. "post /api/orders/tracking/{id}")
        result.addDoc(`${methodName} ${fullMountedPath}`, effectiveParsed);

        // Fallback: Suffix key for backwards compatibility
        result.addDoc(`${methodName} ${openApiSubPath}`, effectiveParsed);
      }
    }
  }

  return result;
}
