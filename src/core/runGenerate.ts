import fs from "node:fs";
import path, { resolve } from "node:path";
import { Project } from "ts-morph";
import { loadConfig } from "../config/loadConfig";
import { generateTypes } from "./generateTypes";
import { generateOpenApi } from "./generateOpenApi";
import { Api } from "../types";
import { cleanDefaultResponse, sanitizeApiPrefix } from "../utils/format";
import { getLibDir } from "../utils/libDir";
import { logger } from "../utils/logger";

export async function runGenerate(configPath: string) {
  const startTime = Date.now();
  const config = await loadConfig(configPath);
  const rootPath = process.cwd();

  // Resolve lib directory once — used for version detection and output paths
  const libDir = getLibDir();

  // Resolve published package version from package.json
  let pkgVersion = "";
  try {
    const pkgRaw = fs.readFileSync(path.join(libDir, "package.json"), "utf-8");
    pkgVersion = (JSON.parse(pkgRaw) as { version?: string }).version ?? "";
  } catch {}

  logger.banner(pkgVersion, configPath, config.tsConfigPath);
  logger.analyzing();

  const project = new Project({
    tsConfigFilePath: resolve(rootPath, config.tsConfigPath),
  });

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
    // Normalize "/" and "" to the same thing — both mean "no extra prefix"
    const normalizedPrefix =
      apiGroup.apiPrefix === "/" ? "" : apiGroup.apiPrefix;
    const normalizedGroup = { ...apiGroup, apiPrefix: normalizedPrefix };

    const sanitizedName = sanitizeApiPrefix(normalizedPrefix) || "root";

    const snapshotPath = await generateTypes({
      ...commonParams,
      apiGroup: normalizedGroup,
      fileName: sanitizedName,
      outputRoot: snapshotOutputRoot,
    });

    await generateOpenApi({
      snapshotPath,
      apiGroup: normalizedGroup,
      ...commonParams,
      fileName: sanitizedName,
      outputRoot: openAPiOutputRoot,
    });
  }

  const merged = {
    security: [],
    ...config.openApi,
    tags: [] as { name: string }[],
    paths: {} as Record<
      string,
      import("openapi-types").OpenAPIV3.PathItemObject
    >,
  };

  for (const apiGroup of apis) {
    const normalizedPrefix =
      apiGroup.apiPrefix === "/" ? "" : apiGroup.apiPrefix;
    const name = sanitizeApiPrefix(normalizedPrefix) || "root";
    const openApiFile = path.join(openAPiOutputRoot, `${name}.json`);

    if (!fs.existsSync(openApiFile)) {
      logger.warn(`Missing OpenAPI file: ${openApiFile}`);
      continue;
    }

    const json = JSON.parse(fs.readFileSync(openApiFile, "utf-8"));
    merged.tags.push({ name: apiGroup.name });

    const customApiMap = new Map<string, Api>();

    if (apiGroup?.api) {
      for (const customApi of apiGroup.api) {
        const fullPath =
          path.posix
            .join(normalizedPrefix, customApi.api)
            .replace(/\/+$/, "")
            .replace(/:([^/]+)/g, "{$1}") || "/";
        customApiMap.set(
          `${customApi.method.toLowerCase()} ${fullPath}`,
          customApi,
        );
      }
    }

    for (const [pathKey, operations] of Object.entries(
      json.paths as Record<
        string,
        import("openapi-types").OpenAPIV3.PathItemObject
      >,
    )) {
      const prefixedPath =
        path.posix.join(normalizedPrefix, pathKey).replace(/\/+$/, "") || "/";
      if (!merged.paths[prefixedPath]) merged.paths[prefixedPath] = {};

      for (const [method, opVal] of Object.entries(operations)) {
        const operation =
          opVal as import("openapi-types").OpenAPIV3.OperationObject;
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
        (
          merged.paths[prefixedPath] as Record<
            string,
            import("openapi-types").OpenAPIV3.OperationObject
          >
        )[method] = operation;
      }
    }
  }

  const outputPath = path.join(rootPath, config.outputs.openApiJson);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const specContent = `${JSON.stringify(merged, null, 2)}\n`;
  fs.writeFileSync(outputPath, specContent);

  logger.summary();
  logger.output(config.outputs.openApiJson, Buffer.byteLength(specContent, "utf-8"));
  logger.done(Date.now() - startTime);
}
