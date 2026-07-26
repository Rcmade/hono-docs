// src/utils/logger.ts
// Grouped-by-phase terminal output for hono-docs CLI.

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

const METHOD_COLORS: Record<string, string> = {
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

const VALIDATOR_COLORS: Record<string, string> = {
  zod: c.cyan,
  valibot: c.magenta,
  typebox: c.orange,
  yup: c.yellow,
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
  sources: { src: string; library: string }[];
};

const _buffer: RouteEntry[] = [];

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
    } catch {}
  },

  /** Print the "🔍 Analyzing routes..." phase header. */
  analyzing(): void {
    try {
      process.stdout.write(`\n  🔍  ${col(c.bold + c.white, "Analyzing routes...")}\n\n`);
    } catch {}
  },

  /** Buffer a single enriched route — flushed later via logger.summary(). */
  record(method: string, routePath: string, source: string, library: string): void {
    try {
      const existing = _buffer.find((r) => r.method === method && r.path === routePath);
      if (existing) {
        existing.sources.push({ src: source, library });
      } else {
        _buffer.push({ method, path: routePath, sources: [{ src: source, library }] });
      }
    } catch {}
  },

  /** Flush buffered routes + print validator progress bars. */
  summary(): void {
    try {
      for (const { method, path, sources } of _buffer) {
        const grouped: Record<string, string[]> = {};
        for (const { src, library } of sources) {
          (grouped[library] ??= []).push(src);
        }
        const tagsStr = Object.entries(grouped)
          .map(([lib, srcs]) => `${formatValidator(lib)} ${col(c.dim, srcs.join(" · "))}`)
          .join(col(c.dim, "  "));

        const truncPath =
          path.length > 44 ? path.slice(0, 22) + "…" + path.slice(-21) : path;

        process.stdout.write(
          `      ${formatMethod(method)}  ${col(c.white, truncPath.padEnd(44))}` +
          `  ${col(c.dim, "→")}  ${tagsStr}\n`,
        );
      }

      const total = _buffer.length;
      const libCounts: Record<string, number> = {};
      for (const r of _buffer) {
        const seen = new Set<string>();
        for (const { library } of r.sources) {
          if (!seen.has(library)) {
            libCounts[library] = (libCounts[library] ?? 0) + 1;
            seen.add(library);
          }
        }
      }

      process.stdout.write(
        `\n            ${col(c.dim, "↳")} ${col(c.bold + c.white, String(total))} ${col(c.dim, "endpoints enriched")}\n`,
      );

      if (Object.keys(libCounts).length > 0) {
        process.stdout.write(`\n\n  📊  ${col(c.bold + c.white, "Validators detected")}\n\n`);
        const maxLen = Math.max(...Object.keys(libCounts).map((k) => k.length));
        for (const [lib, cnt] of Object.entries(libCounts)) {
          process.stdout.write(
            `      ${col(VALIDATOR_COLORS[lib] ?? c.white, lib.padEnd(maxLen + 2))}` +
            `${progressBar(cnt, total)}  ${col(c.dim, `${cnt} routes`)}\n`,
          );
        }
      }
    } catch {} finally {
      // Always clear the buffer — even if rendering failed
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
    } catch {}
  },

  /** Print the final success line with elapsed time. */
  done(elapsedMs: number): void {
    try {
      process.stdout.write(
        `\n\n  ${col(c.bold + c.green, "✨  Done")} ${col(c.dim, `in ${elapsedMs}ms`)}\n\n`,
      );
    } catch {}
  },

  /** Print a non-fatal warning. */
  warn(message: string): void {
    try {
      process.stdout.write(`  ${col(c.yellow, "⚠")}  ${col(c.dim, message)}\n`);
    } catch {}
  },
};
