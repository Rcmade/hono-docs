// src/utils/logger.ts
// Grouped-by-phase terminal output for hono-docs CLI.

import type { HttpMethod, RouteSource, SchemaEngine, ValidatorLibrary, ValidatorTarget } from "../types";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  white: "\x1b[97m",
  gray: "\x1b[90m",
  cyan: "\x1b[96m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  magenta: "\x1b[95m",
  red: "\x1b[91m",
  orange: "\x1b[38;5;208m",
};

function col(ansi: string, text: string): string {
  return `${ansi}${text}${c.reset}`;
}

const METHOD_COLORS: Record<HttpMethod, string> & Record<string, string | undefined> = {
  GET: c.bold + c.green,
  POST: c.bold + c.cyan,
  PUT: c.bold + c.yellow,
  PATCH: c.bold + c.orange,
  DELETE: c.bold + c.red,
  HEAD: c.bold + c.blue,
  OPTIONS: c.bold + c.magenta,
  ALL: c.bold + c.gray,
};

function formatMethod(method: string): string {
  const ansi = METHOD_COLORS[method.toUpperCase()] ?? c.bold + c.white;
  return col(ansi, method.toUpperCase().padEnd(6));
}

const VALIDATOR_COLORS: Record<SchemaEngine, string> & Record<string, string | undefined> = {
  zod: c.cyan,
  valibot: c.magenta,
  typebox: c.orange,
  yup: c.yellow,
  unsupported: c.red,
  "ts type": c.blue,
  "no input": c.gray,
};

function formatValidator(lib: string): string {
  const ansi = VALIDATOR_COLORS[lib.toLowerCase()] ?? c.white;
  return col(ansi, lib.toLowerCase());
}

function progressBar(count: number, total: number, width = 20): string {
  const filled = total === 0 ? 0 : Math.round((count / total) * width);
  return col(c.green, "█".repeat(filled)) + col(c.gray, "░".repeat(width - filled));
}

type RouteEntry = {
  method: string;
  path: string;
  hasDoc?: boolean;
  sources: RouteSource[];
};

const _buffer: RouteEntry[] = [];
let _cacheHits = 0;
let _totalGroups = 0;

export const logger = {
  /** Print the header banner with version, config, and tsconfig paths. */
  banner(version: string, configPath: string, tsConfig: string): void {
    try {
      process.stdout.write("\n");
      process.stdout.write(
        `  ${col(c.bold + c.cyan, "◆  hono-docs")} ${col(c.dim, `v${version}`)}` +
        `  ${col(c.dim, "·")}  ${col(c.white, configPath)}` +
        `  ${col(c.dim, "·")}  ${col(c.white, tsConfig)}\n\n`,
      );
    } catch { }
  },

  /** Print the "🔍 Analyzing routes..." phase header. */
  analyzing(): void {
    try {
      process.stdout.write(`\n  🔍  ${col(c.bold + c.white, "Analyzing routes...")}\n\n`);
    } catch { }
  },

  /** Print a cache-hit line for a group that was loaded from cache. */
  cached(groupName: string): void {
    try {
      _cacheHits++;
      process.stdout.write(
        `      ${col(c.bold + c.green, "⚡")}  ${col(c.white, groupName.padEnd(44))}  ${col(c.dim, "→  loaded from cache (skipped)")}\n`,
      );
    } catch { }
  },

  /** Track total group count (called once per group, before or after cache check). */
  trackGroup(): void {
    _totalGroups++;
  },

  /** Register a discovered route before schema evaluation. */
  registerRoute(method: string, routePath: string, hasDoc = false): void {
    try {
      const m = method.toUpperCase();
      const existing = _buffer.find((r) => r.method === m && r.path === routePath);
      if (existing) {
        existing.hasDoc = Boolean(existing.hasDoc || hasDoc);
      } else {
        _buffer.push({ method: m, path: routePath, hasDoc, sources: [] });
      }
    } catch { }
  },

  /** Buffer a single enriched route input source — flushed later via logger.summary(). */
  record(
    method: string,
    routePath: string,
    source: ValidatorTarget,
    library: ValidatorLibrary | "ts type",
  ): void {
    try {
      const m = method.toUpperCase();
      const existing = _buffer.find((r) => r.method === m && r.path === routePath);
      if (existing) {
        if (!existing.sources.some((s) => s.src === source && s.library === library)) {
          existing.sources.push({ src: source, library });
        }
      } else {
        _buffer.push({ method: m, path: routePath, sources: [{ src: source, library }] });
      }
    } catch { }
  },

  /** Get recorded sources for a specific route (for caching). */
  getRouteSources(method: string, routePath: string): RouteSource[] {
    try {
      const m = method.toUpperCase();
      const existing = _buffer.find((r) => r.method === m && r.path === routePath);
      return existing ? existing.sources : [];
    } catch {
      return [];
    }
  },

  /** Restore recorded sources for a cached route. */
  recordSources(
    method: string,
    routePath: string,
    sources: RouteSource[],
    hasDoc = false,
  ): void {
    try {
      const m = method.toUpperCase();
      const existing = _buffer.find((r) => r.method === m && r.path === routePath);
      if (existing) {
        existing.sources = sources;
        existing.hasDoc = Boolean(existing.hasDoc || hasDoc);
      } else {
        _buffer.push({ method: m, path: routePath, hasDoc, sources });
      }
    } catch { }
  },

  /** Flush buffered routes + print documentation and schema engine dashboards. */
  summary(): void {
    try {
      if (_buffer.length === 0) {
        // If all groups were served from cache, this is expected — show nothing
        if (_totalGroups > 0 && _cacheHits === _totalGroups) {
          return;
        }
        process.stdout.write(
          `      ${col(c.yellow, "📭  No API endpoints were discovered in the target application.")}\n` +
          `      ${col(c.dim, "    Please verify your appTypePath in your configuration and check that route types are exported.")}\n`,
        );
        return;
      }

      for (const { method, path, sources } of _buffer) {
        const truncPath =
          path.length > 44 ? path.slice(0, 22) + "…" + path.slice(-21) : path;
        const methodStr = formatMethod(method);
        const pathStr = col(c.white, truncPath.padEnd(44));

        if (sources.length === 0) {
          process.stdout.write(`      ${methodStr}  ${pathStr}  ${col(c.dim, "→  no input")}\n`);
        } else {
          const grouped: Record<string, string[]> = {};
          for (const { src, library } of sources) {
            (grouped[library] ??= []).push(src);
          }
          const tagsStr = Object.entries(grouped)
            .map(([lib, srcs]) => `${formatValidator(lib)} ${col(c.dim, srcs.join(" · "))}`)
            .join(col(c.dim, "  "));
          process.stdout.write(`      ${methodStr}  ${pathStr}  ${col(c.dim, "→")}  ${tagsStr}\n`);
        }
      }

      const total = _buffer.length;
      const methodCounts: Record<string, number> = {};
      let docCount = 0;

      for (const r of _buffer) {
        methodCounts[r.method] = (methodCounts[r.method] ?? 0) + 1;
        if (r.hasDoc) docCount++;
      }

      const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "ALL"];
      const methodParts = Object.entries(methodCounts)
        .sort(
          ([a], [b]) =>
            (methodOrder.indexOf(a) !== -1 ? methodOrder.indexOf(a) : 99) -
            (methodOrder.indexOf(b) !== -1 ? methodOrder.indexOf(b) : 99),
        )
        .map(([m, cnt]) => `${col(METHOD_COLORS[m] ?? (c.bold + c.white), m)}: ${cnt}`)
        .join(col(c.dim, " · "));

      const docPercentage = Math.round((docCount / total) * 100);

      process.stdout.write(`\n\n  📊  ${col(c.bold + c.white, "Documentation Summary")}\n\n`);
      process.stdout.write(
        `      ${col(c.dim, "Endpoints Discovered  :")}  ${col(c.bold + c.white, `${total} total`)}  ${col(c.dim, "(")} ${methodParts} ${col(c.dim, ")")}\n`,
      );
      process.stdout.write(
        `      ${col(c.dim, "JSDoc Coverage        :")}  ${col(c.white, `${docCount} / ${total} routes documented (${docPercentage}%)`)}\n`,
      );

      const libCounts: Record<string, number> = {};
      for (const r of _buffer) {
        if (r.sources.length === 0) {
          libCounts["no input"] = (libCounts["no input"] ?? 0) + 1;
        } else {
          const seen = new Set<string>();
          for (const { library } of r.sources) {
            if (!seen.has(library)) {
              libCounts[library] = (libCounts[library] ?? 0) + 1;
              seen.add(library);
            }
          }
        }
      }

      if (Object.keys(libCounts).length > 0) {
        process.stdout.write(`\n\n  ⚙️  ${col(c.bold + c.white, "Schema Resolution Engine")}\n\n`);
        const maxLen = Math.max(...Object.keys(libCounts).map((k) => k.length));

        const libOrder = ["zod", "valibot", "typebox", "yup", "ts type", "no input"];
        const sortedLibs = Object.entries(libCounts).sort(([a], [b]) => {
          const ia = libOrder.indexOf(a.toLowerCase());
          const ib = libOrder.indexOf(b.toLowerCase());
          return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib);
        });

        for (const [lib, cnt] of sortedLibs) {
          let label = "(Dynamic)";
          if (lib === "ts type") label = "(Static AST)";
          if (lib === "no input") label = "(No validation required)";

          process.stdout.write(
            `      ${col(VALIDATOR_COLORS[lib.toLowerCase()] ?? c.white, lib.padEnd(maxLen + 2))}` +
            `${progressBar(cnt, total)}  ${col(c.white, `${cnt} ${cnt === 1 ? "route " : "routes"}`)}  ${col(c.dim, label)}\n`,
          );
        }
      }
    } catch { } finally {
      _buffer.length = 0;
    }
  },

  /** Print the output file path and size. */
  output(outputPath: string, sizeBytes?: number): void {
    try {
      const sizeStr =
        sizeBytes != null ? col(c.dim, `  ${(sizeBytes / 1024).toFixed(1)} KB`) : "";
      process.stdout.write(`\n\n  📄  ${col(c.bold + c.white, "Output written")}\n\n`);
      process.stdout.write(`      ${col(c.cyan + c.bold, outputPath)}${sizeStr}\n`);
    } catch { }
  },

  /** Print the final success line with elapsed time and optional cache stats. */
  done(elapsedMs: number): void {
    try {
      let cacheStr = "";
      if (_totalGroups > 0 && _cacheHits > 0) {
        cacheStr = col(c.dim, `  (${_cacheHits}/${_totalGroups} groups from cache)`);
      }
      process.stdout.write(
        `\n\n  ${col(c.bold + c.green, "✨  Done")} ${col(c.dim, `in ${elapsedMs}ms`)}${cacheStr}\n\n`,
      );
      // Reset counters for next run (e.g. programmatic usage)
      _cacheHits = 0;
      _totalGroups = 0;
    } catch { }
  },

  /** Print a non-fatal warning. */
  warn(message: string): void {
    try {
      process.stdout.write(`  ${col(c.yellow, "⚠")}  ${col(c.dim, message)}\n`);
    } catch { }
  },
};
