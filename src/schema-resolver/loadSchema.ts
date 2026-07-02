// src/schema-resolver/loadSchema.ts
// Step 4: Dynamically import a schema from a TypeScript file.
// Handles both exported schemas and non-exported local const schemas.

import { createJiti } from "jiti";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Attempts to load a specific named export from a TypeScript file.
 *
 * Strategy A (fast path): If the variable is a direct named export.
 * Strategy B (injection): If the variable is a local const (not exported),
 *   we create a tiny temp wrapper that appends `export { name as __target__ }`
 *   to get access to the non-exported local variable.
 *
 * Edge cases handled:
 * - File throws on import (DB side effects) → Strategy B also fails → null
 * - interopDefault false positive → Strategy A checks named exports only
 * - Temp file write error → returns null
 */
export async function loadLiveSchema(
  filePath: string,
  exportName: string,
  cwd: string,
): Promise<object | null> {
  // Use interopDefault: false so we don't confuse module namespace with default export
  const jiti = createJiti(cwd, {
    interopDefault: false,
    moduleCache: false,
  });

  // ── Strategy A: Direct named export ──────────────────────────────────────────
  try {
    const mod = (await jiti.import(filePath)) as Record<string, object>;
    if (mod && typeof mod === "object") {
      // Check for named export only — don't fall back to default here
      if (Object.prototype.hasOwnProperty.call(mod, exportName)) {
        const val = mod[exportName];
        if (val !== null && val !== undefined) return val;
      }
    }
  } catch {
    // File may have side effects — continue to Strategy B
  }

  // ── Strategy B: Non-exported local const (temp file injection) ────────────────
  const tempId = randomUUID().replace(/-/g, "");
  const tempFile = join(dirname(filePath), `__hono_docs_temp_${tempId}.ts`);

  try {
    const originalSource = readFileSync(filePath, "utf-8");
    // Append a named re-export of the target local variable
    const wrappedSource = `${originalSource}\nexport { ${exportName} as __target__ };\n`;
    writeFileSync(tempFile, wrappedSource, "utf-8");

    const tempMod = (await jiti.import(tempFile)) as Record<string, object>;
    if (
      tempMod &&
      Object.prototype.hasOwnProperty.call(tempMod, "__target__")
    ) {
      return tempMod["__target__"] ?? null;
    }
    return null;
  } catch {
    return null;
  } finally {
    // Always clean up the temp file
    try {
      unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
}
