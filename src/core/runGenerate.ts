import fs from "node:fs";
import path, { resolve } from "node:path";
import yaml from "yaml";
import { PROJECT_CACHE_DIR_NAME } from "../utils/constants";
import { Project } from "ts-morph";
import { loadConfig } from "../config/loadConfig";
import { generateTypes } from "./generateTypes";
import { generateOpenApi } from "./generateOpenApi";
import { Api } from "../types";
import { cleanDefaultResponse, sanitizeApiPrefix } from "../utils/format";
import { getLibDir } from "../utils/libDir";
import { logger } from "../utils/logger";
import { CacheManager } from "../cache/index";
import { deduplicateComponents } from "../utils/deduplicateSchemas";
import { getAdapter } from "../openapi/adapters/index";

export interface RunGenerateOptions {
  /** When true, bypass all cache reads and do not write a new cache. */
  noCache?: boolean;
  /** Persistent ts-morph Project instance for lightning fast watch-mode AST caching. */
  projectInstance?: Project;
  /** When true, validate existing specs without writing anything to disk. */
  validate?: boolean;
}

export async function runGenerate(
  configPath: string,
  options: RunGenerateOptions = {},
) {
  const startTime = Date.now();
  const config = await loadConfig(configPath);
  const rootPath = process.cwd();
  const { noCache = false } = options;

  // Resolve lib directory once — used for version detection, output paths, and cache
  const libDir = getLibDir();

  // Resolve published package version from package.json
  let pkgVersion = "";
  try {
    const pkgRaw = fs.readFileSync(path.join(libDir, "package.json"), "utf-8");
    pkgVersion = (JSON.parse(pkgRaw) as { version?: string }).version ?? "";
  } catch {}

  logger.banner(pkgVersion, configPath, config.tsConfigPath);
  logger.analyzing();

  // ── Cache setup ─────────────────────────────────────────────────────────────
  const cache = new CacheManager(rootPath, pkgVersion);

  if (noCache) {
    // --no-cache: skip all reads and don't persist at the end
    cache.invalidate();
  } else {
    // Compute global hash: any change here wipes all groups
    const configContent = (() => {
      try {
        return fs.readFileSync(resolve(rootPath, configPath), "utf-8");
      } catch {
        return "";
      }
    })();
    const tsConfigContent = (() => {
      try {
        return fs.readFileSync(resolve(rootPath, config.tsConfigPath), "utf-8");
      } catch {
        return "";
      }
    })();
    const globalHash = cache.hashString(
      pkgVersion + configContent + tsConfigContent,
    );
    cache.checkGlobal(globalHash);
  }

  let projectInstance: Project | null = options.projectInstance || null;
  const getProject = () => {
    if (!projectInstance) {
      projectInstance = new Project({
        tsConfigFilePath: resolve(rootPath, config.tsConfigPath),
      });
    }
    return projectInstance;
  };

  const apis = config.apis;

  const snapshotOutputRoot = path.resolve(
    rootPath,
    PROJECT_CACHE_DIR_NAME,
    "types",
  );
  const openAPiOutputRoot = path.resolve(
    rootPath,
    PROJECT_CACHE_DIR_NAME,
    "openapi",
  );

  const commonParams = {
    config,
    libDir,
    rootPath,
  };

  for (const apiGroup of apis) {
    // Normalize "/" and "" to the same thing — both mean "no extra prefix"
    const normalizedPrefix =
      apiGroup.apiPrefix === "/" ? "" : apiGroup.apiPrefix;
    const normalizedGroup = { ...apiGroup, apiPrefix: normalizedPrefix };

    const sanitizedName = sanitizeApiPrefix(normalizedPrefix) || "root";

    logger.trackGroup();

    // ── Group-level cache check ────────────────────────────────────────────
    let groupCacheHit = false;
    let groupHash: string | null = null;
    let expectedOutput: string | null = null;
    let groupDepFiles: string[] = [];

    if (!noCache) {
      try {
        // Guard: only attempt hash collection if the entry file actually exists.
        // If it doesn't, generateTypes below will throw the proper error — we must
        // not swallow it here by catching a ts-morph FileNotFoundError first.
        const resolvedInput = resolve(rootPath, apiGroup.appTypePath);
        if (!fs.existsSync(resolvedInput)) {
          // File doesn't exist — skip hash collection entirely.
          // generateTypes will throw with a clear error message below.
          throw new Error("entry file not found, skip hash collection");
        }
        const absInput = fs.realpathSync(resolvedInput);

        expectedOutput = path.join(openAPiOutputRoot, `${sanitizedName}.json`);

        // Fast-path: check if we can verify group validity directly via previously recorded dependency files!
        const existingGroup = cache.getGroupEntry(sanitizedName);
        if (
          existingGroup &&
          existingGroup.dependencyFiles &&
          existingGroup.dependencyFiles.includes(absInput)
        ) {
          const quickHash = cache.hashGroup(existingGroup.dependencyFiles);
          const cachedPath = cache.getGroupCache(sanitizedName, quickHash);
          if (cachedPath) {
            groupHash = quickHash;
            groupDepFiles = existingGroup.dependencyFiles;
            logger.cached(sanitizedName);
            groupCacheHit = true;
          }
        }

        // Slow-path: if fast-path missed or first run, resolve full dependency tree via lightweight ts-morph project
        if (!groupCacheHit) {
          const depProject = new Project({
            tsConfigFilePath: resolve(rootPath, config.tsConfigPath),
          });
          depProject.addSourceFileAtPath(absInput);
          depProject.resolveSourceFileDependencies();

          // BFS over source files reachable from this entry point (skipping node_modules)
          const visited = new Set<string>();
          const queue = [absInput];
          while (queue.length > 0) {
            const fp = queue.pop()!;
            const realFp = fs.existsSync(fp) ? fs.realpathSync(fp) : fp;
            if (visited.has(realFp)) continue;
            visited.add(realFp);
            const sf =
              depProject.getSourceFile(realFp) || depProject.getSourceFile(fp);
            if (!sf) continue;
            for (const ref of sf.getReferencedSourceFiles()) {
              const refPath = ref.getFilePath();
              const realRef = fs.existsSync(refPath)
                ? fs.realpathSync(refPath)
                : refPath;
              if (!realRef.includes("node_modules")) {
                queue.push(realRef);
              }
            }
          }

          groupDepFiles = Array.from(visited);
          groupHash = cache.hashGroup(groupDepFiles);
          const cachedPath = cache.getGroupCache(sanitizedName, groupHash!);

          if (cachedPath) {
            // Cache hit — log and skip generation entirely
            logger.cached(sanitizedName);
            groupCacheHit = true;
          }
        }
      } catch {
        // Hash collection failed (missing file, ts-morph issue, etc.)
        // Fall through — generateTypes will throw the real error if the file is missing.
        groupHash = null;
        expectedOutput = null;
        groupDepFiles = [];
      }
    }

    if (!groupCacheHit) {
      // Always generate when: --no-cache, cache miss, or hash collection failed.
      // Errors from generateTypes / generateOpenApi propagate normally to the CLI error handler.
      const activeProject = getProject();
      const snapshotPath = await generateTypes({
        ...commonParams,
        project: activeProject,
        apiGroup: normalizedGroup,
        fileName: sanitizedName,
        outputRoot: snapshotOutputRoot,
      });

      await generateOpenApi({
        snapshotPath,
        apiGroup: normalizedGroup,
        ...commonParams,
        project: activeProject,
        fileName: sanitizedName,
        outputRoot: openAPiOutputRoot,
        // Only pass cacheManager when we have a valid hash to store
        cacheManager: !noCache && groupHash ? cache : undefined,
      });

      // Record the result in cache only when we have a valid hash
      if (!noCache && groupHash && expectedOutput) {
        cache.setGroupCache(
          sanitizedName,
          groupHash,
          expectedOutput,
          groupDepFiles,
        );
      }
    }
  }

  const merged = {
    security: [],
    ...config.openApi,
    tags: [] as { name: string }[],
    components: { schemas: {} },
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
            .replace(/:([a-zA-Z0-9_]+)(?:{([^{}]*(?:{[^{}]*}[^{}]*)*)})?/g, "{$1}") || "/";
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

        cleanDefaultResponse(operation);
        (
          merged.paths[prefixedPath] as Record<
            string,
            import("openapi-types").OpenAPIV3.OperationObject
          >
        )[method] = operation;
      }
    }
  }

  // Apply version-specific document root fields (e.g. $schema for 3.1)
  const adapter = getAdapter(config.openApiVersion);
  const finalSpec = adapter.makeDocumentRoot(
    merged as unknown as Record<string, unknown>,
  );

  const deduplicatedSpec = deduplicateComponents(
    finalSpec as unknown as import("openapi-types").OpenAPIV3.Document,
  );

  
  if (config.validateOutput !== false) {
    try {
      const SwaggerParser = await import("@apidevtools/swagger-parser");
      const clonedSpec = JSON.parse(JSON.stringify(deduplicatedSpec));
      
      await SwaggerParser.default.validate(clonedSpec);
    } catch (err) {
      logger.warn(
        `OpenAPI Spec Validation Warning:\n${(err as Error).message}`,
      );
    }
  }

  let jsonSize: number | undefined;
  let validationFailed = false;

  if (config.outputs.openApiJson) {
    const jsonPath = path.join(rootPath, config.outputs.openApiJson);
    const specContent = `${JSON.stringify(deduplicatedSpec, null, 2)}\n`;

    if (options.validate) {
      const existing = fs.existsSync(jsonPath)
        ? fs.readFileSync(jsonPath, "utf-8")
        : null;
      if (existing !== specContent) {
        logger.error(
          `Validation failed: ${config.outputs.openApiJson} is out of date. Please run 'generate' to update it.`,
        );
        validationFailed = true;
      }
    } else {
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, specContent);
    }
    jsonSize = Buffer.byteLength(specContent, "utf-8");
  }

  let yamlSize: number | undefined;
  if (config.outputs.openApiYaml) {
    const yamlPath = path.join(rootPath, config.outputs.openApiYaml);
    const yamlContent = yaml.stringify(deduplicatedSpec);

    if (options.validate) {
      const existing = fs.existsSync(yamlPath)
        ? fs.readFileSync(yamlPath, "utf-8")
        : null;
      if (existing !== yamlContent) {
        logger.error(
          `Validation failed: ${config.outputs.openApiYaml} is out of date. Please run 'generate' to update it.`,
        );
        validationFailed = true;
      }
    } else {
      fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
      fs.writeFileSync(yamlPath, yamlContent);
    }
    yamlSize = Buffer.byteLength(yamlContent, "utf-8");
  }

  // Persist cache manifest to disk (no-op if nothing changed or --no-cache)
  if (!noCache) {
    cache.flush();
  }

  if (options.validate && validationFailed) {
    throw new Error("Validation failed: Output file(s) are out of date.");
  }

  logger.summary();

  if (!options.validate) {
    if (config.outputs.openApiJson) {
      logger.output(config.outputs.openApiJson, jsonSize);
    }
    if (config.outputs.openApiYaml) {
      logger.output(config.outputs.openApiYaml, yamlSize);
    }
  } else {
    logger.success(
      "Validation passed: OpenAPI specifications match the codebase.",
    );
  }

  logger.done(Date.now() - startTime);
}
