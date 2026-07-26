import { Project, SyntaxKind } from "ts-morph";
const project = new Project({ tsConfigFilePath: "./tsconfig.json" });
const sf = project.getSourceFileOrThrow("src/index.ts");
const aliasDecl = sf.getTypeAliasOrThrow("AppType");

const typeChecker = project.getTypeChecker();
const schemaType = aliasDecl.getType().getTypeArguments()[1];

const types = schemaType.isUnion() ? schemaType.getUnionTypes() : [schemaType];
for (const t of types) {
  for (const routeProp of t.getProperties()) {
    console.log("Route:", routeProp.getName());
  }
}
