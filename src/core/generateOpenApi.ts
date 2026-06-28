// src/core/generateOpenApi.ts
import fs from "node:fs";
import path from "node:path";
import {
  SyntaxKind,
  TypeLiteralNode,
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
import { extractJSDocs } from "../utils/jsdoc";
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
  apiGroup,
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

  // Gather all TypeLiteralNodes (handle intersections)
  const literals: TypeLiteralNode[] = [];
  if (routesNode.isKind(SyntaxKind.IntersectionType)) {
    for (const tn of routesNode
      .asKind(SyntaxKind.IntersectionType)!
      .getTypeNodes()) {
      if (tn.isKind(SyntaxKind.TypeLiteral))
        literals.push(tn as TypeLiteralNode);
    }
  } else if (routesNode.isKind(SyntaxKind.TypeLiteral)) {
    literals.push(routesNode as TypeLiteralNode);
  } else {
    console.error("DEBUG: routesNode is", routesNode.getText());
    throw new Error("Routes type is not a literal or intersection of literals");
  }

  const paths: OpenAPI = {};
  const jsDocMap = extractJSDocs(
    path.resolve(rootPath, apiGroup.appTypePath),
    project,
  );

  for (const lit of literals) {
    for (const member of lit.getMembers()) {
      if (!member.isKind(SyntaxKind.PropertySignature)) continue;
      const routeProp = member.asKindOrThrow(SyntaxKind.PropertySignature);
      // Extract route string and normalize to OpenAPI path syntax
      const raw = routeProp.getNameNode().getText().replace(/"/g, "");
      const route = raw.replace(/:([^/]+)/g, "{$1}");
      if (!paths[route]) paths[route] = {};

      // === NEW: get the RHS TypeLiteralNode properly ===
      const tn = routeProp.getTypeNode();
      if (!tn || !tn.isKind(SyntaxKind.TypeLiteral)) continue;
      const rhs = tn as TypeLiteralNode;

      for (const m of rhs.getMembers()) {
        if (!m.isKind(SyntaxKind.PropertySignature)) continue;
        const methodProp = m.asKindOrThrow(SyntaxKind.PropertySignature);
        const name = methodProp.getNameNode().getText(); // e.g. "$get"
        const http = name.slice(1).toLowerCase(); // "get", "post", etc.
        const variants = unwrapUnion(methodProp.getType());

        const key = `${http} ${route}`;
        const jsDoc = jsDocMap.get(key);

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
        const params = genParameters(variants[0]);
        if (params.length) op.parameters = params;

        // requestBody
        const rb = genRequestBody(variants[0]);
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
          const schemas = vs.map((v) =>
            buildSchema(
              v.getProperty("output")!.getValueDeclarationOrThrow().getType(),
            ),
          );
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
