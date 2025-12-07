import fs from "node:fs";
import path, { resolve } from "node:path";
import { Project } from "ts-morph";
import { loadConfig } from "../config/loadConfig";
import { generateTypes } from "./generateTypes";
import { generateOpenApi } from "./generateOpenApi";
import { Api } from "../types";
import { cleanDefaultResponse, sanitizeApiPrefix } from "../utils/format";
import { getLibDir } from "../utils/libDir";

export async function runGenerate(configPath: string) {
  const config = await loadConfig(configPath);
  const rootPath = process.cwd();
  console.log("Initializing ts-morph with tsConfig:", config.tsConfigPath);
  const project = new Project({
    tsConfigFilePath: resolve(rootPath, config.tsConfigPath),
  });

  // const isDevMode =
  //   __dirname.includes("/src/") || __dirname.includes("\\src\\");

  // const libDir = isDevMode
  //   ? path.resolve(__dirname, "../../")
  //   : // : path.dirname(require.resolve("@rcmade/hono-docs/package.json"));
  //     path.dirname(fileURLToPath(import.meta.url));
  const libDir = getLibDir();
  console.log("Library root directory:", libDir);

  const apis = config.apis;

  const snapshotOutputRoot = path.resolve(libDir, "output/types");
  const openAPiOutputRoot = path.resolve(libDir, "output/openapi");

  const commonParams = {
    config,
    libDir,
    project,
    rootPath,
  };
  for (const apiGroup of apis) {
    const sanitizedName = sanitizeApiPrefix(apiGroup.apiPrefix);

    const snapshotPath = await generateTypes({
      ...commonParams,
      apiGroup: apiGroup,
      fileName: sanitizedName,
      outputRoot: snapshotOutputRoot,
    });

    await generateOpenApi({
      snapshotPath,
      ...commonParams,
      fileName: sanitizedName,
      outputRoot: openAPiOutputRoot,
    });
  }

  const merged = {
    ...config.openApi,
    tags: [] as { name: string }[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paths: {} as Record<string, any>,
  };

  for (const apiGroup of apis) {
    const name = sanitizeApiPrefix(apiGroup.apiPrefix);
    const openApiFile = path.join(openAPiOutputRoot, `${name}.json`);

    if (!fs.existsSync(openApiFile)) {
      console.warn(`⚠️ Missing OpenAPI file: ${openApiFile}`);
      continue;
    }

    const json = JSON.parse(fs.readFileSync(openApiFile, "utf-8"));
    merged.tags.push({ name: apiGroup.name });

    const customApiMap = new Map<string, Api>();

    if (apiGroup?.api) {
      for (const customApi of apiGroup.api) {
        const fullPath =
          path.posix
            .join(apiGroup.apiPrefix, customApi.api)
            .replace(/\/+$/, "") || "/";
        customApiMap.set(
          `${customApi.method.toLowerCase()} ${fullPath}`,
          customApi
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [pathKey, operations] of Object.entries<any>(json.paths)) {
      const prefixedPath =
        path.posix.join(apiGroup.apiPrefix, pathKey).replace(/\/+$/, "") || "/";
      if (!merged.paths[prefixedPath]) merged.paths[prefixedPath] = {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [method, operation] of Object.entries<any>(operations)) {
        const opKey = `${method.toLowerCase()} ${prefixedPath}`;
        const customApi = customApiMap.get(opKey);

        // Override or enrich metadata if defined
        if (customApi) {
          operation.summary = customApi.summary || operation.summary;
          operation.description =
            customApi.description || operation.description;
          operation.tags =
            customApi.tag && customApi.tag.length > 0
              ? customApi.tag
              : [apiGroup.name];
        } else {
          operation.tags = operation.tags || [];
          if (!operation.tags.includes(apiGroup.name)) {
            operation.tags.push(apiGroup.name);
          }
        }

        cleanDefaultResponse(operation, prefixedPath, method);
        merged.paths[prefixedPath][method] = operation;
      }
    }
  }

  const outputPath = path.join(rootPath, config.outputs.openApiJson);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`✅ Final merged OpenAPI spec written to: ${outputPath}`);
}
