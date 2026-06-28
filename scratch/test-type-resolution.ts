import { Project, Type } from "ts-morph";
import path from "node:path";

const project = new Project({
  tsConfigFilePath: "./tsconfig.json",
});

const routeFile = "./examples/basic-app/src/index.ts";
const sf = project.addSourceFileAtPath(routeFile);

const typeAlias = sf.getTypeAliasOrThrow("AppType");
const type = typeAlias.getType();

// AppType is HonoBase<E, S, BasePath>.
// To get the routes, we can just get the properties of the type!
// Wait, no. Hono uses the `routes` property or we can extract the second type argument.
const typeArgs = type.getTypeArguments();
console.log("Type Arguments Length:", typeArgs.length);
if (typeArgs.length >= 2) {
  const schemaType = typeArgs[1];
  console.log("Schema Type Text:", schemaType.getText());

  let types = schemaType.isUnion() ? schemaType.getUnionTypes() : [schemaType];

  for (const t of types) {
    const props = t.getProperties();
    for (const prop of props) {
      console.log("Route:", prop.getName());
      const propType = project
        .getTypeChecker()
        .getTypeOfSymbolAtLocation(prop, typeAlias);
      const methods = propType.getProperties();
      for (const method of methods) {
        console.log("  Method:", method.getName());
        const decls = method.getDeclarations();
        for (const decl of decls) {
          const docs = decl.getLeadingCommentRanges();
          if (docs.length > 0) {
            console.log(
              "    Decl Docs:",
              docs.map((d) => d.getText()).join(""),
            );
          }
        }
        const methodType = project
          .getTypeChecker()
          .getTypeOfSymbolAtLocation(method, typeAlias);
        
        const variants = methodType.isUnion() ? methodType.getUnionTypes() : [methodType];
        console.log(`    Variants: ${variants.length}`);

        for (const [i, v] of variants.entries()) {
          console.log(`      Variant ${i}:`);
          const statusProp = v.getProperty("status");
          if (statusProp) {
            const statusType = project.getTypeChecker().getTypeOfSymbolAtLocation(statusProp, typeAlias);
            console.log(`        status text: ${statusType.getText()}`);
            console.log(`        isNumberLiteral: ${statusType.isNumberLiteral()}`);
            if (statusType.isNumberLiteral()) {
              console.log(`        literalValue: ${statusType.getLiteralValue()}`);
            }
          } else {
             console.log(`        No status property`);
          }
        }
      }
    }
  }
}
