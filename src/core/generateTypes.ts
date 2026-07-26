import fs from "node:fs";
import path from "node:path";
import type { ApiGroup, GenerateParams } from "../types";
import { normalizeImportPaths } from "../utils/format";

export async function generateTypes({
  config,
  project,
  rootPath,
  apiGroup,
  fileName,
  outputRoot,
}: GenerateParams & { apiGroup: ApiGroup }) {
  fs.mkdirSync(outputRoot, { recursive: true });

  const outputPath = path.join(outputRoot, `${fileName}.d.ts`);
  const absInput = path.resolve(rootPath, apiGroup.appTypePath);

  const sourceFile = project.addSourceFileAtPath(absInput);
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
