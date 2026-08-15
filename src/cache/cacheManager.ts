// src/cache/cacheManager.ts
// Production-grade incremental cache for hono-docs.
// Uses SHA-256 content hashing (node:crypto) — zero new dependencies.
//
// Two layers:
//   1. Group-level cache: skips generateTypes + generateOpenApi entirely when
//      the full dependency graph of a route group is unchanged.
//   2. Schema-level cache: skips jiti dynamic imports for unchanged schema files.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { OpenAPIV3 } from "openapi-types";
import type { RouteSource } from "../types";
import { PROJECT_CACHE_DIR_NAME } from "../utils/constants";

// ─── Manifest types ──────────────────────────────────────────────────────────

export interface GroupCacheEntry {
  /** Combined SHA-256 of all source files in this group's dependency graph */
  inputHash: string;
  /** Absolute path to the cached openapi/<name>.json output file */
  outputPath: string;
  /** List of dependency files discovered in the AST graph */
  dependencyFiles?: string[];
}

export interface RouteCacheEntry {
  dependencyHash: string;
  operation: OpenAPIV3.OperationObject;
  sources?: RouteSource[];
  dependencyFiles?: string[];
}

interface CacheManifest {
  /** Library version — any bump triggers full invalidation */
  version: string;
  /** Combined SHA-256 of hono-docs config + tsconfig content */
  globalHash: string;
  /** Per-group generation cache */
  groups: Record<string, GroupCacheEntry>;
  /** Per-schema resolution cache: schemaKey → OpenAPI schema object */
  schemaCache: Record<string, OpenAPIV3.SchemaObject>;
  /** Per-route granular generation cache: routeKey → RouteCacheEntry */
  routeCache: Record<string, RouteCacheEntry>;
}

const EMPTY_MANIFEST: CacheManifest = {
  version: "",
  globalHash: "",
  groups: {},
  schemaCache: {},
  routeCache: {},
};

// ─── CacheManager ────────────────────────────────────────────────────────────

export class CacheManager {
  private manifest: CacheManifest;
  private readonly manifestPath: string;
  private readonly pkgVersion: string;
  private dirty = false;

  constructor(rootPath: string, pkgVersion: string) {
    this.pkgVersion = pkgVersion;
    const cacheDir = join(rootPath, PROJECT_CACHE_DIR_NAME, "cache");
    mkdirSync(cacheDir, { recursive: true });
    this.manifestPath = join(cacheDir, "manifest.json");
    this.manifest = this._load();
  }

  // ── File hashing ───────────────────────────────────────────────────────────

  /**
   * Compute a SHA-256 hex digest of a single file's content.
   * Returns an empty string if the file cannot be read (treated as "changed").
   */
  hashFile(filePath: string): string {
    try {
      const content = readFileSync(filePath, "utf-8");
      return createHash("sha256").update(content).digest("hex");
    } catch {
      return "";
    }
  }

  /**
   * Compute a combined SHA-256 over an ordered list of file paths.
   * Hashes both the paths and their contents so renames are detected.
   */
  hashGroup(filePaths: string[]): string {
    const h = createHash("sha256");
    // De-duplicate, normalize canonical path (handling symlinks & OS casing), and sort for determinism
    const sorted = Array.from(
      new Set(filePaths.map((fp) => (existsSync(fp) ? realpathSync(fp) : fp))),
    ).sort();
    for (const fp of sorted) {
      h.update(fp);
      h.update(this.hashFile(fp));
    }
    return h.digest("hex");
  }

  /**
   * Compute a hash of a short string value (e.g. config contents).
   */
  hashString(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  // ── Global invalidation ────────────────────────────────────────────────────

  /**
   * Check whether the global hash (version + config + tsconfig) has changed.
   * If it has, wipe the entire cache before proceeding.
   * Returns true if cache is still valid, false if it was wiped.
   */
  checkGlobal(globalHash: string): boolean {
    if (
      this.manifest.version !== this.pkgVersion ||
      this.manifest.globalHash !== globalHash
    ) {
      this.invalidate();
      this.manifest.version = this.pkgVersion;
      this.manifest.globalHash = globalHash;
      this.dirty = true;
      return false; // cache was invalidated
    }
    return true; // cache is still valid
  }

  /**
   * Wipe all cached state. Called on global invalidation or --no-cache flag.
   */
  invalidate(): void {
    this.manifest = {
      ...EMPTY_MANIFEST,
      version: this.pkgVersion,
      globalHash: this.manifest.globalHash,
    };
    this.dirty = true;
  }

  // ── Group-level cache ──────────────────────────────────────────────────────

  /**
   * Returns the cached output path if the group's input hash matches
   * and the cached file still exists on disk. Returns null on cache miss.
   */
  getGroupCache(groupName: string, groupHash: string): string | null {
    const entry = this.manifest.groups[groupName];
    if (!entry) return null;
    if (entry.inputHash !== groupHash) return null;
    // Verify the cached output file still exists on disk
    if (!existsSync(entry.outputPath)) return null;
    return entry.outputPath;
  }

  /**
   * Returns the full group cache entry if available.
   */
  getGroupEntry(groupName: string): GroupCacheEntry | null {
    return this.manifest.groups[groupName] ?? null;
  }

  /**
   * Record a successful group generation in the cache.
   */
  setGroupCache(
    groupName: string,
    groupHash: string,
    outputPath: string,
    dependencyFiles?: string[],
  ): void {
    this.manifest.groups[groupName] = {
      inputHash: groupHash,
      outputPath,
      dependencyFiles,
    };
    this.dirty = true;
  }

  // ── Schema-level cache ─────────────────────────────────────────────────────

  /**
   * Returns a cached OpenAPI schema object if available, or null on cache miss.
   * Key is: sha256(filePath) + exportName + sha256(fileContent)
   */
  getSchemaCache(schemaKey: string): OpenAPIV3.SchemaObject | null {
    return this.manifest.schemaCache[schemaKey] ?? null;
  }

  /**
   * Store a resolved schema in the schema cache.
   */
  setSchemaCache(schemaKey: string, schema: OpenAPIV3.SchemaObject): void {
    this.manifest.schemaCache[schemaKey] = schema;
    this.dirty = true;
  }

  // ── Route-level fine-grained cache ─────────────────────────────────────────

  /**
   * Returns a cached OpenAPI Operation object for an endpoint if its source file hash matches.
   */
  getRouteCache(
    routeKey: string,
    dependencyHash: string,
  ): RouteCacheEntry | null {
    const entry = this.manifest.routeCache?.[routeKey];
    if (!entry) return null;
    if (entry.dependencyHash !== dependencyHash) return null;
    return entry;
  }

  /**
   * Record a generated OpenAPI Operation object in the fine-grained per-route cache.
   */
  setRouteCache(
    routeKey: string,
    dependencyHash: string,
    operation: OpenAPIV3.OperationObject,
    sources: RouteSource[] = [],
    dependencyFiles?: string[],
  ): void {
    if (!this.manifest.routeCache) {
      this.manifest.routeCache = {};
    }
    this.manifest.routeCache[routeKey] = {
      dependencyHash,
      operation,
      sources,
      dependencyFiles,
    };
    this.dirty = true;
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  /**
   * Persist the in-memory manifest to disk.
   * Only writes if something actually changed (dirty flag).
   * Non-fatal: a failed flush just means the next run starts cold.
   */
  flush(): void {
    if (!this.dirty) return;
    try {
      writeFileSync(
        this.manifestPath,
        JSON.stringify(this.manifest, null, 2),
        "utf-8",
      );
    } catch {
      // Intentionally swallow — cache is always a best-effort optimisation
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _load(): CacheManifest {
    try {
      if (!existsSync(this.manifestPath)) return { ...EMPTY_MANIFEST };
      const raw = readFileSync(this.manifestPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CacheManifest>;
      return {
        version: parsed.version ?? "",
        globalHash: parsed.globalHash ?? "",
        groups: parsed.groups ?? {},
        schemaCache: parsed.schemaCache ?? {},
        routeCache: parsed.routeCache ?? {},
      };
    } catch {
      // Corrupted manifest — start fresh
      return { ...EMPTY_MANIFEST };
    }
  }
}
