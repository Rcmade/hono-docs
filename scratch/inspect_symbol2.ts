import { Project } from "ts-morph";
const project = new Project({ tsConfigFilePath: "./examples/test-suite/tsconfig.json" });
const sf = project.getSourceFileOrThrow("examples/test-suite/src/index.ts");
const appType = sf.getTypeAliasOrThrow("AppType");
const typeArgs = appType.getTypeNodeOrThrow().asKindOrThrow(183).getTypeArguments();
const routesNode = typeArgs[1];
const typeChecker = project.getTypeChecker();
const schemaType = typeChecker.getTypeAtLocation(routesNode);
const routeProp = schemaType.getProperties().find(p => p.getName().includes("products"));
if (routeProp) {
  const routeType = typeChecker.getTypeOfSymbolAtLocation(routeProp, appType);
  const getSym = routeType.getProperties().find(p => p.getName() === "$get");
  if (getSym) {
    const decls = getSym.getDeclarations();
    console.log("Declarations found:", decls.length);
    decls.forEach(d => console.log("Kind:", d.getKindName(), "Text:", d.getText().slice(0, 100)));
  }
}
