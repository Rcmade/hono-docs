import { Project, SyntaxKind, TypeNode, TypeReferenceNode, ImportTypeNode, ts } from "ts-morph";
import path from "node:path";

const project = new Project({
  tsConfigFilePath: "./tsconfig.json",
});

const sf = project.addSourceFileAtPath("./examples/basic-app/src/index.ts");
const aliasDecl = sf.getTypeAliasOrThrow("AppType");
const typeChecker = project.getTypeChecker();
const topTypeNode = aliasDecl.getTypeNode()!;

let typeArgs: readonly TypeNode<ts.TypeNode>[];

if (topTypeNode.isKind(SyntaxKind.TypeReference)) {
  typeArgs = (topTypeNode as TypeReferenceNode).getTypeArguments();
} else if (topTypeNode.isKind(SyntaxKind.ImportType)) {
  typeArgs = (topTypeNode as ImportTypeNode).getTypeArguments();
} else {
  throw new Error("AppType must be an ImportType or a TypeReference");
}

const routesNode = typeArgs[1];
const sType = typeChecker.getTypeAtLocation(routesNode);

console.log("Found properties:", sType.getProperties().length);
for (const prop of sType.getProperties()) {
  console.log("Prop:", prop.getName());
  const routeType = typeChecker.getTypeOfSymbolAtLocation(prop, aliasDecl);
  for (const method of routeType.getProperties()) {
    console.log("  Method:", method.getName());
    const decls = method.getDeclarations();
    if (decls.length > 0) {
      console.log("    Decls:", decls[0].getKindName());
      console.log("    Has comments?", decls[0].getLeadingCommentRanges().length > 0);
      const jsdocs = (decls[0] as any).getJsDocs?.();
      console.log("    JSDocs?", jsdocs ? jsdocs.length : 0);
    }
  }
}
