// src/core/generateOpenApi.ts
import fs from "node:fs";
import path from "node:path";
import {
  SyntaxKind,
  ImportTypeNode,
  TypeReferenceNode,
  TypeNode,
  ts,
} from "ts-morph";
import type {
  AppTypeSnapshotPath,
  GenerateParams,
  OpenApiPath,
  ApiGroup,
} from "../types";
import { extractJSDocs, type ParsedJSDoc } from "../utils/jsdoc";
import { genParameters } from "../utils/parameters";
import { genRequestBody } from "../utils/requestBody";
import { buildSchema } from "../utils/buildSchema";
import { groupBy, unwrapUnion, generateDefaultSummary } from "../utils/format";
import { locateRouteEntry } from "../schema-resolver/routeIndex";
import { extractASTHeaders } from "../utils/responseHeaders";
import { logger } from "../utils/logger";
import type { CacheManager } from "../cache/index";

import type { OpenAPIV3 } from "openapi-types";

export async function generateOpenApi({
  config,
  snapshotPath,
  fileName,
  project,
  rootPath,
  outputRoot,
  cacheManager,
}: // {
  //   config: HonoDocsConfig;
  //   snapshotPath: AppTypeSnapshotPath;
  // }
  GenerateParams & {
    snapshotPath: AppTypeSnapshotPath;
    apiGroup: ApiGroup;
    cacheManager?: CacheManager;
  }): Promise<OpenApiPath> {
  const sf = project.addSourceFileAtPath(
    path.resolve(rootPath, snapshotPath.appTypePath),
  );
  const aliasDecl = sf.getTypeAliasOrThrow("AppType");

  const topTypeNode = aliasDecl.getTypeNode();

  let typeArgs: readonly TypeNode<ts.TypeNode>[];

  if (topTypeNode?.isKind(SyntaxKind.TypeReference)) {
    typeArgs = (topTypeNode as TypeReferenceNode).getTypeArguments();
  } else if (topTypeNode?.isKind(SyntaxKind.ImportType)) {
    typeArgs = (topTypeNode as ImportTypeNode).getTypeArguments();
  } else {
    throw new Error("AppType must be an ImportType or a TypeReference");
  }

  if (typeArgs.length < 2) {
    throw new Error("Expected two type arguments on HonoBase");
  }

  const routesNode = typeArgs[1];

  const paths: Record<string, OpenAPIV3.PathItemObject> = {};

  // Memoized dependency tracer to ensure instantaneous per-route caching without repeated AST traversals
  const fileDependenciesCache = new Map<string, { hash: string; files: string[] }>();
  const getRouteDepInfo = (filePath: string): { hash: string; files: string[] } => {
    if (!cacheManager) return { hash: "", files: [] };
    const cached = fileDependenciesCache.get(filePath);
    if (cached) return cached;

    const visited = new Set<string>();
    const queue = [filePath];
    while (queue.length > 0) {
      const fp = queue.pop()!;
      const realFp = fs.existsSync(fp) ? fs.realpathSync(fp) : fp;
      if (visited.has(realFp)) continue;
      visited.add(realFp);
      const currSf = project.getSourceFile(realFp) || project.getSourceFile(fp);
      if (!currSf) continue;
      for (const ref of currSf.getReferencedSourceFiles()) {
        const refPath = ref.getFilePath();
        const realRef = fs.existsSync(refPath) ? fs.realpathSync(refPath) : refPath;
        if (!realRef.includes("node_modules")) {
          queue.push(realRef);
        }
      }
    }
    const files = Array.from(visited);
    const hash = cacheManager.hashGroup(files);
    const result = { hash, files };
    fileDependenciesCache.set(filePath, result);
    return result;
  };

  // Extract all JSDocs globally from all project files
  const jsDocMap = extractJSDocs(project);

  const typeChecker = project.getTypeChecker();
  const schemaType = typeChecker.getTypeAtLocation(routesNode);

  // Schema type might be a Union (if .route() is used)
  const types = schemaType.isUnion()
    ? schemaType.getUnionTypes()
    : [schemaType];

  for (const t of types) {
    for (const routeProp of t.getProperties()) {
      const raw = routeProp.getName().replace(/"/g, "").replace(/'/g, "");
      const pathPatterns: Record<string, string> = {};
      const regexExtractor = /:([^\/{}]+)(?:{(.+?)})?(?=\/|$)/g;
      let match;
      while ((match = regexExtractor.exec(raw)) !== null) {
        if (match[2]) {
          pathPatterns[match[1]] = match[2];
        }
      }

      const route = raw.replace(/:([^\/{}]+)(?:{(.+?)})?(?=\/|$)/g, "{$1}");
      if (!paths[route]) paths[route] = {};

      // Get the type of the route methods object (e.g. { $get: ... })
      const routeType = typeChecker.getTypeOfSymbolAtLocation(
        routeProp,
        aliasDecl,
      );
      if (!routeType) continue;

      for (const methodSymbol of routeType.getProperties()) {
        const name = methodSymbol.getName(); // e.g. "$get"
        if (!name.startsWith("$")) continue;
        const http = name.slice(1).toLowerCase(); // "get", "post", etc.
        const routeEntry = locateRouteEntry(http, raw, project);

        // Get the type of the method (e.g. { input: ..., output: ... })
        const methodType = typeChecker.getTypeOfSymbolAtLocation(
          methodSymbol,
          aliasDecl,
        );
        if (!methodType) continue;

        const variants = unwrapUnion(methodType);

        let depHash = "";
        let depFiles: string[] = [];
        const routeKey = `${http.toLowerCase()} ${raw}`;

        if (cacheManager) {
          if (routeEntry?.sourceFilePath) {
            const depInfo = getRouteDepInfo(routeEntry.sourceFilePath);
            depHash = depInfo.hash;
            depFiles = depInfo.files;
            if (depHash) {
              const routeCache = cacheManager.getRouteCache(routeKey, depHash);
              if (routeCache) {
                logger.recordSources(
                  http,
                  raw,
                  routeCache.sources || [],
                  !!(
                    routeCache.operation.summary ||
                    routeCache.operation.description ||
                    (routeCache.operation.tags &&
                      routeCache.operation.tags.length > 0)
                  ),
                );
                // @ts-expect-error we are dynamically building the paths object
                paths[route][http] = routeCache.operation;
                continue;
              }
            }
          }
        }

        const exactKey = `${http} ${route}`;
        let jsDoc: ParsedJSDoc | undefined;

        if (jsDocMap.has(exactKey)) {
          jsDoc = jsDocMap.get(exactKey)![0];
        } else {
          for (const [k, docs] of jsDocMap.entries()) {
            const [mapHttp, ...mapPathParts] = k.split(" ");
            const mapPath = mapPathParts.join(" ");
            if (mapHttp === http && route.endsWith(mapPath)) {
              jsDoc = docs[0];
              break;
            }
          }
        }

        if (jsDoc?.exclude) {
          continue;
        }

        const hasDoc = !!(
          jsDoc?.summary ||
          jsDoc?.description ||
          (jsDoc?.tags && jsDoc?.tags?.length > 0)
        );
        logger.registerRoute(http, raw, hasDoc);

        const op: OpenAPIV3.OperationObject = {
          summary: jsDoc?.summary || generateDefaultSummary(http, route),
          responses: {},
        };

        if (jsDoc?.description) {
          op.description = jsDoc.description;
        }

        if (jsDoc?.tags && jsDoc.tags.length > 0) {
          op.tags = jsDoc.tags;
        }

        // parameters - try runtime schema resolution first, fall back to type-based
        const params = await genParameters({
          type: variants[0],
          typeChecker,
          contextNode: aliasDecl,
          routePath: raw,
          method: http,
          project,
          rootPath,
          pathPatterns,
          cacheManager,
        });
        if (params.length) op.parameters = params;

        // requestBody — try runtime schema resolution first, fall back to type-based
        const rb = await genRequestBody({
          type: variants[0],
          typeChecker,
          contextNode: aliasDecl,
          routePath: raw,
          method: http,
          project,
          rootPath,
          cacheManager,
        });
        if (rb) op.requestBody = rb;

        // responses
        op.responses = {};
        const byStatus = groupBy(variants, (v) => {
          const statusProp = v.getProperty("status");
          if (!statusProp) return "default";
          const statusType = typeChecker.getTypeOfSymbolAtLocation(
            statusProp,
            aliasDecl,
          );
          const s = statusType.getText();

          if (statusType.isNumberLiteral()) {
            return String(statusType.getLiteralValue());
          }

          return /^\d+$/.test(s) ? s : "default";
        });
        for (const [code, vs] of Object.entries(byStatus)) {
          const schemas = vs.map((v) => {
            const outProp = v.getProperty("output");
            if (!outProp) return {};
            const outType = typeChecker.getTypeOfSymbolAtLocation(
              outProp,
              aliasDecl,
            );
            return buildSchema(outType, typeChecker, aliasDecl);
          });
          const schema = schemas.length > 1 ? { oneOf: schemas } : schemas[0];

          const responseObj: OpenAPIV3.ResponseObject = {
            description:
              code === "default"
                ? `Generic status from ${vs[0]
                  .getProperty("status")!
                  .getValueDeclarationOrThrow()
                  .getType()
                  .getText()}`
                : `Status ${code}`,
            content: { "application/json": { schema } },
          };

          const routeNode = routeEntry?.call ?? null;
          const astHeaders = routeNode ? extractASTHeaders(routeNode) : [];
          const jsdocHeaders = jsDoc?.responseHeaders?.[code] || [];

          if (astHeaders.length > 0 || jsdocHeaders.length > 0) {
            responseObj.headers = {};

            // Apply AST headers first (fallback)
            for (const h of astHeaders) {
              responseObj.headers[h.name] = h.schema;
            }

            // Apply JSDoc headers (overrides AST)
            for (const h of jsdocHeaders) {
              responseObj.headers[h.name] = h.schema;
            }
          }

          op.responses[code] = responseObj;
        }

        if (cacheManager && depHash && depFiles.length > 0) {
          const sources = logger.getRouteSources(http, raw);
          cacheManager.setRouteCache(routeKey, depHash, op, sources, depFiles);
        }

        // @ts-expect-error we are dynamically building the paths object
        paths[route][http] = op;
      }
    }
  }

  // Clean up any routes that ended up completely empty (e.g. all methods were excluded)
  for (const route of Object.keys(paths)) {
    if (Object.keys(paths[route]).length === 0) {
      delete paths[route];
    }
  }

  const spec = {
    ...config.openApi,
    paths,
  };

  // write to disk
  const outputPath = path.join(outputRoot, `${fileName}.json`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), "utf-8");
  return { openApiPath: outputPath };
}
