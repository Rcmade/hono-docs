import { Project } from "ts-morph";
import path from "node:path";
import fs from "node:fs";

const root = process.cwd();
const project = new Project({
  tsConfigFilePath: path.join(root, "tsconfig.json"),
});

const appTypePath = path.join(root, "src/index.ts");
const orderRoutesPath = path.join(root, "src/routes/orderRoutes.ts");

const entryFile = project.addSourceFileAtPath(appTypePath);
const orderFile = project.getSourceFile(orderRoutesPath);

function printType() {
  const alias = entryFile.getTypeAliasOrThrow("AppType");
  console.log("AppType length:", alias.getType().getText(alias).length);
}

console.log("Initial:");
printType();

// Simulate file change
const originalContent = fs.readFileSync(orderRoutesPath, "utf-8");
const modifiedContent = originalContent.replace(
  "success: true,",
  "success: true, // modified",
);
fs.writeFileSync(orderRoutesPath, modifiedContent);

// 1. Refresh ALL files
project.getSourceFiles().forEach((sf) => sf.refreshFromFileSystemSync());
console.log("After global refresh:");
printType();

// Restore
fs.writeFileSync(orderRoutesPath, originalContent);
