import fs from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import type { ApiGroup, GenerateParams } from "../types";
import { normalizeImportPaths } from "../utils/format";
import { PROJECT_CACHE_DIR_NAME } from "../utils/constants";

export async function generateTypes({
  config,
  rootPath,
  apiGroup,
  fileName,
}: GenerateParams & { apiGroup: ApiGroup }) {
  const outputRoot = path.resolve(rootPath, PROJECT_CACHE_DIR_NAME, "types");
  fs.mkdirSync(outputRoot, { recursive: true });

  const outputPath = path.join(outputRoot, `${fileName}.d.ts`);
  const absInput = path.resolve(rootPath, apiGroup.appTypePath);

  // We deliberately use a FRESH Project instance here to bypass the aggressive
  // ts-morph TypeChecker cache that persists across watch-mode cycles, ensuring
  // that deeply inferred Hono AppTypes (like `typeof app`) are always accurate.
  const typeProject = new Project({
    tsConfigFilePath: path.resolve(rootPath, config.tsConfigPath),
  });

  const sourceFile = typeProject.addSourceFileAtPath(absInput);
  const typeAliases = sourceFile.getTypeAliases();
  const interfaces = sourceFile.getInterfaces();

  let result = `// AUTO-GENERATED from ${apiGroup.appTypePath}\n\n`;

  typeAliases.forEach((alias) => {
    const raw = alias.getType().getText(alias);
    const clean = normalizeImportPaths(raw);
    result += `export type ${alias.getName()} = ${clean};\n\n`;
  });

  interfaces.forEach((intf) => {
    result += intf.getText() + "\n\n";
  });

  const preContent = config.preDefineTypeContent || "";

  fs.writeFileSync(outputPath, `${preContent}\n${result}`, "utf-8");
  return { appTypePath: outputPath, name: fileName };
}
