import fs from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import chokidar from "chokidar";
import ignore from "ignore";
import { runGenerate, RunGenerateOptions } from "./runGenerate";
import { logger } from "../utils/logger";
import { loadConfig } from "../config/loadConfig";
import { invalidateProjectIndex } from "../schema-resolver/routeIndex";
import { PROJECT_CACHE_DIR_NAME } from "../utils/constants";

/**
 * Attaches a robust Chokidar filesystem watcher that fully respects .gitignore
 * and natively handles symlinks, duplicate events, and edge cases across environments.
 */
function watchDirectory(
  dir: string,
  outDir: string,
  internalCacheDir: string,
  onChange: (filepath: string) => void,
) {
  const ig = ignore();
  const gitignorePath = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    try {
      ig.add(fs.readFileSync(gitignorePath, "utf-8"));
    } catch {
      // ignore read errors
    }
  }

  const watcher = chokidar.watch(dir, {
    ignored: (filePath: string) => {
      if (filePath.includes("node_modules") || filePath.includes(".git"))
        return true;
      // Exclude final openapi output dir (e.g. openapi/)
      if (filePath.startsWith(outDir)) return true;
      // Exclude internal .hono-docs/ cache dir (contains generated .d.ts snapshots
      // and intermediate openapi JSONs — watching these causes an infinite rebuild loop)
      if (filePath.startsWith(internalCacheDir)) return true;
      const relPath = path.relative(dir, filePath);
      if (relPath && ig.ignores(relPath)) return true;
      return false;
    },
    ignoreInitial: true,
  });

  watcher.on("all", (event, filepath) => {
    onChange(filepath);
  });

  return () => watcher.close();
}


export async function runWatch(
  configPath: string,
  options: RunGenerateOptions = {},
) {
  const rootPath = process.cwd();
  const config = await loadConfig(configPath);

  // Persistent ts-morph Project to bypass slow cold starts
  const projectInstance = new Project({
    tsConfigFilePath: path.resolve(rootPath, config.tsConfigPath),
  });

  // Expose the persistent project to runGenerate
  options.projectInstance = projectInstance;

  let isBuilding = false;
  let pendingRun = false;
  let debounceTimeout: NodeJS.Timeout | null = null;

  const build = async () => {
    if (isBuilding) {
      pendingRun = true;
      return;
    }
    isBuilding = true;
    pendingRun = false;

    try {
      console.clear();
      logger.info("Changes detected. Rebuilding documentation...");
      await runGenerate(configPath, options);
      logger.success("Waiting for changes... (Press Ctrl+C to exit)");
    } catch (err) {
      logger.error(
        "Build failed:",
        err instanceof Error ? err.message : String(err),
      );
      logger.info("Waiting for changes to recover...");
    } finally {
      isBuilding = false;
      if (pendingRun) {
        build(); // trigger queued build
      }
    }
  };

  // Perform initial generation
  await build();

  const outDir = path.resolve(
    rootPath,
    path.dirname(config.outputs?.openApiJson || ""),
  );

  // Resolve the internal .hono-docs/ cache dir — must be excluded from the watcher
  // to prevent an infinite rebuild loop caused by generated .d.ts snapshots and
  // intermediate openapi JSON files being picked up as user-authored source changes.
  const internalCacheDir = path.resolve(rootPath, PROJECT_CACHE_DIR_NAME);

  const handleFileChange = (filepath: string) => {
    // Note: Chokidar already filtered node_modules, .git, .gitignore files, and outDir!

    // Update AST selectively without re-parsing entire project
    const sourceFile = projectInstance.getSourceFile(filepath);
    if (sourceFile) {
      if (fs.existsSync(filepath)) {
        sourceFile.refreshFromFileSystemSync();
      } else {
        projectInstance.removeSourceFile(sourceFile);
      }
      invalidateProjectIndex(projectInstance);
    } else if (
      fs.existsSync(filepath) &&
      (filepath.endsWith(".ts") || filepath.endsWith(".js"))
    ) {
      projectInstance.addSourceFileAtPath(filepath);
      invalidateProjectIndex(projectInstance);
    }

    // Debounce to batch multiple rapid saves
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(build, 300);
  };

  watchDirectory(rootPath, outDir, internalCacheDir, handleFileChange);
}
