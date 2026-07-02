import { Project } from "ts-morph";
const project = new Project({ tsConfigFilePath: "./examples/test-suite/tsconfig.json" });
const sf = project.getSourceFileOrThrow("examples/test-suite/src/index.ts");
const appType = sf.getTypeAliasOrThrow("AppType");
console.log(appType.getType().getText().substring(0, 500));
