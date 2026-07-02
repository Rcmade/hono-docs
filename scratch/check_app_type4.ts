import { Project } from "ts-morph";
const project = new Project({ tsConfigFilePath: "./examples/test-suite/tsconfig.json" });
const sf = project.getSourceFileOrThrow("examples/test-suite/src/routes/enterpriseBillingRoutes.ts");
const v = sf.getVariableDeclarationOrThrow("enterpriseBillingRoutes");
console.log(v.getType().getText());
