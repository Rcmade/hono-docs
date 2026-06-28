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
import { groupBy, unwrapUnion } from "../utils/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAPI = Record<string, any>;

export async function generateOpenApi({
  config,
  snapshotPath,
  fileName,
  project,
  rootPath,
  outputRoot,
}: // {
//   config: HonoDocsConfig;
//   snapshotPath: AppTypeSnapshotPath;
// }
GenerateParams & {
  snapshotPath: AppTypeSnapshotPath;
  apiGroup: ApiGroup;
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

  const paths: OpenAPI = {};

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
      const route = raw.replace(/:([^/]+)/g, "{$1}");
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

        // Get the type of the method (e.g. { input: ..., output: ... })
        const methodType = typeChecker.getTypeOfSymbolAtLocation(
          methodSymbol,
          aliasDecl,
        );
        if (!methodType) continue;

        const variants = unwrapUnion(methodType);

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const op: any = {
          summary:
            jsDoc?.summary || `Auto-generated ${http.toUpperCase()} ${route}`,
        };

        if (jsDoc?.description) {
          op.description = jsDoc.description;
        }

        if (jsDoc?.tags && jsDoc.tags.length > 0) {
          op.tags = jsDoc.tags;
        }

        // parameters
        const params = genParameters(variants[0], typeChecker, aliasDecl);
        if (params.length) op.parameters = params;

        // requestBody
        const rb = genRequestBody(variants[0], typeChecker, aliasDecl);
        if (rb) op.requestBody = rb;

        // responses
        op.responses = {};
        const byStatus = groupBy(variants, (v) => {
          const s = v
            .getProperty("status")!
            .getValueDeclarationOrThrow()
            .getType()
            .getText();
          return /^\d+$/.test(s) ? s : "default";
        });
        for (const [code, vs] of Object.entries(byStatus)) {
          const schemas = vs.map((v) => {
            const outProp = v.getProperty("output");
            if (!outProp) return {};
            const outType = typeChecker.getTypeOfSymbolAtLocation(outProp, aliasDecl);
            return buildSchema(outType, typeChecker, aliasDecl);
          });
          const schema = schemas.length > 1 ? { oneOf: schemas } : schemas[0];
          op.responses[code] = {
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
        }

        paths[route][http] = op;
      }
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
  console.log(`✅ OpenAPI written to ${outputPath}`);
  return { openApiPath: outputPath };
}
