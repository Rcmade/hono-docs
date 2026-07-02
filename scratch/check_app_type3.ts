import { Project } from "ts-morph";
const project = new Project({ tsConfigFilePath: "./examples/test-suite/tsconfig.json" });
const sf = project.getSourceFileOrThrow("examples/test-suite/src/index.ts");
const aliasDecl = sf.getTypeAliasOrThrow("AppType");
const typeChecker = project.getTypeChecker();
const appType = typeChecker.getTypeOfSymbolAtLocation(aliasDecl.getSymbol()!, aliasDecl);
// The AppType is HonoBase<Env, Schema, "/api">
// To get the routes, we just need to look at the schema.
// Because it's a TypeQuery of `typeof app`, `appType` is the HonoBase class type.
const schemaTypeArgs = appType.getTypeArguments();
const schemaType = schemaTypeArgs[1];
const props = schemaType.getProperties().map(p => p.getName());
console.log(props);
