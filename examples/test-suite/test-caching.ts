import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import assert from "node:assert";

const OPENAPI_JSON_PATH = path.resolve("./openapi/openapi.json");
const ROOT_CACHE_MANIFEST = path.resolve("../../output/cache/manifest.json");
const STRESS_ROUTES_PATH = path.resolve("./src/routes/cacheStressRoutes.ts");
const VALIBOT_SCHEMA_PATH = path.resolve("./src/schemas/externalValibot.ts");
const INDEX_TS_PATH = path.resolve("./src/index.ts");
const DYNAMIC_FILE_PATH = path.resolve("./src/routes/dynamicTestRoutes.ts");

// Backup original contents of files we plan to modify for tests
const originalStressRoutes = fs.readFileSync(STRESS_ROUTES_PATH, "utf-8");
const originalValibotSchema = fs.readFileSync(VALIBOT_SCHEMA_PATH, "utf-8");
const originalIndexTs = fs.readFileSync(INDEX_TS_PATH, "utf-8");

interface TestResults {
  coldRunTimeMs: number;
  warmRunTimeMs: number;
  granularRunTimeMs: number;
  schemaInvalidateRunTimeMs: number;
  deleteApiRunTimeMs: number;
  replaceApiRunTimeMs: number;
  newFileRunTimeMs: number;
  deleteFileRunTimeMs: number;
  totalEndpoints: number;
}

function countEndpoints(spec: any): number {
  let count = 0;
  for (const pathKey of Object.keys(spec.paths || {})) {
    const methods = spec.paths[pathKey];
    for (const method of Object.keys(methods)) {
      if (["get", "post", "put", "delete", "patch", "options", "head", "all"].includes(method.toLowerCase())) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Automatically resolve OpenAPI $ref references to check underlying field accuracy against code.
 */
function resolveSchema(spec: any, schemaOrRef: any): any {
  if (!schemaOrRef) return undefined;
  if (schemaOrRef.$ref) {
    const parts = schemaOrRef.$ref.split("/");
    const schemaName = parts[parts.length - 1];
    const resolved =
      spec.components?.schemas?.[schemaName] ||
      spec.definitions?.[schemaName] ||
      spec.$defs?.[schemaName];
    assert(resolved, `Failed to resolve schema reference: ${schemaOrRef.$ref}`);
    return resolveSchema(spec, resolved);
  }
  return schemaOrRef;
}

function runDocsCommand(): { output: string; durationMs: number } {
  const start = Date.now();
  try {
    const output = execSync("npx hono-docs generate --config ./hono-docs.ts", { encoding: "utf-8", stdio: "pipe" });
    const durationMs = Date.now() - start;
    return { output, durationMs };
  } catch (err: any) {
    console.error("Error running hono-docs generate:", err.stdout || err.message, err.stderr || "");
    throw err;
  }
}

async function runCachingTestSuite() {
  console.log("🧪 Starting Exhaustive Caching & Dynamic Mutation Verification Suite (>100 test cases)...\n");
  const results: Partial<TestResults> = {};

  try {
    // ── PHASE 1: COLD RUN & DEEP FIELD ACCURACY CHECK ────────────────────────
    console.log("▶ Phase 1: Cold Run Generation & Complete Schema Field Accuracy Check");
    if (fs.existsSync(OPENAPI_JSON_PATH)) fs.unlinkSync(OPENAPI_JSON_PATH);
    if (fs.existsSync(ROOT_CACHE_MANIFEST)) fs.unlinkSync(ROOT_CACHE_MANIFEST);
    if (fs.existsSync(DYNAMIC_FILE_PATH)) fs.unlinkSync(DYNAMIC_FILE_PATH);

    const cold = runDocsCommand();
    results.coldRunTimeMs = cold.durationMs;
    console.log(`  ✓ Cold generation completed in ${cold.durationMs}ms`);

    assert(fs.existsSync(OPENAPI_JSON_PATH), "Expected openapi.json to be generated on cold run!");
    const coldSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    const endpointCount = countEndpoints(coldSpec);
    results.totalEndpoints = endpointCount;
    console.log(`  ✓ Discovered ${endpointCount} endpoints in OpenAPI spec`);
    assert(endpointCount > 100, `Expected >100 test cases, found ${endpointCount}`);

    // Verify exact request field matching against codebase (Zod simpleSchema in cacheStressRoutes)
    const orderCreate = coldSpec.paths["/api/stress/order/create"]?.post;
    assert(orderCreate && orderCreate.requestBody, "Expected requestBody on /api/stress/order/create");
    const itemSchema = resolveSchema(coldSpec, orderCreate.requestBody.content["application/json"].schema);
    assert.strictEqual(itemSchema.properties?.name?.type, "string", "Field 'name' in requestBody must match Zod string definition in codebase!");
    assert(
      ["integer", "number"].includes(itemSchema.properties?.value?.type),
      "Field 'value' in requestBody must match Zod int/number definition in codebase!",
    );
    assert(itemSchema.required?.includes("name") && itemSchema.required?.includes("value"), "Fields 'name' and 'value' must be required as defined in codebase");

    // Verify parameter & header field matching (Valibot & TypeBox in enterpriseBillingRoutes)
    const adjustKey = Object.keys(coldSpec.paths).find((k) => k.includes("/billing/invoices/") && k.endsWith("/adjust"));
    assert(adjustKey, "Expected enterprise billing adjust endpoint in OpenAPI spec");
    const adjustOp = coldSpec.paths[adjustKey]?.post;
    const paramNames = (adjustOp.parameters || []).map((p: any) => p.name);
    assert(paramNames.includes("orgId") && paramNames.includes("invoiceId"), "Path parameters orgId and invoiceId must match codebase definitions");
    assert(paramNames.includes("ipAddress"), "Query parameter ipAddress must match Valibot schema definition");
    assert(paramNames.includes("x-enterprise-token"), "Header parameter x-enterprise-token must match TypeBox schema definition");

    console.log("  ✓ Deep request/response field accuracy assertions against codebase PASSED\n");

    // ── PHASE 2: WARM RUN (GROUP CACHE HIT) ──────────────────────────────────
    console.log("▶ Phase 2: Warm Run (Group Cache Verification)");
    const warm = runDocsCommand();
    results.warmRunTimeMs = warm.durationMs;
    console.log(`  ✓ Warm generation completed in ${warm.durationMs}ms`);
    assert(
      warm.output.includes("from cache") || warm.output.includes("loaded from cache"),
      "Expected warm run to output cache hit skip log",
    );

    const warmSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    assert.deepStrictEqual(warmSpec, coldSpec, "Warm spec output MUST be byte-for-byte identical to cold spec");
    console.log("  ✓ Warm run Group Cache assertions PASSED (instantaneous skip confirmed)\n");

    // ── PHASE 3: GRANULAR PER-ROUTE CACHE INVALIDATION ────────────────────────
    console.log("▶ Phase 3: Granular Route Cache & Invalidation Verification");
    const modifiedStress = originalStressRoutes.replace(
      "Retrieve all users",
      "Retrieve all active users (MODIFIED FOR TEST)",
    );
    fs.writeFileSync(STRESS_ROUTES_PATH, modifiedStress, "utf-8");

    const granular = runDocsCommand();
    results.granularRunTimeMs = granular.durationMs;
    console.log(`  ✓ Granular warm run after file edit completed in ${granular.durationMs}ms`);

    const granularSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    const userListOp = granularSpec.paths["/api/stress/user/list"]?.get;
    assert(userListOp, "Expected /api/stress/user/list GET route");
    assert.strictEqual(
      userListOp.summary,
      "Retrieve all active users (MODIFIED FOR TEST)",
      "Granular route cache failed to reflect updated route summary!",
    );
    assert.strictEqual(countEndpoints(granularSpec), endpointCount, "Endpoint count must remain identical after summary edit");
    console.log("  ✓ Granular per-route cache invalidation assertions PASSED\n");

    // ── PHASE 4: SCHEMA CACHE INVALIDATION ────────────────────────────────────
    console.log("▶ Phase 4: External Schema Cache Invalidation Check");
    const modifiedValibot = originalValibotSchema.replace(
      "country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),",
      "country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),\n  testCacheProp: v.optional(v.string()),",
    );
    fs.writeFileSync(VALIBOT_SCHEMA_PATH, modifiedValibot, "utf-8");

    const schemaRun = runDocsCommand();
    results.schemaInvalidateRunTimeMs = schemaRun.durationMs;
    console.log(`  ✓ Schema invalidation run completed in ${schemaRun.durationMs}ms`);

    const schemaSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    const vbResponseSchema = resolveSchema(
      schemaSpec,
      schemaSpec.paths["/api/valibot/vb-create"]?.post?.requestBody?.content?.["application/json"]?.schema,
    );
    assert(vbResponseSchema && vbResponseSchema.properties, "Expected properties on resolved Valibot schema");
    assert(
      vbResponseSchema.properties.testCacheProp,
      "Expected newly added testCacheProp to appear in OpenAPI JSON after schema file edit! Schema cache did not invalidate properly.",
    );
    console.log("  ✓ External schema cache invalidation assertions PASSED\n");

    // ── PHASE 5: API DELETED TEST ─────────────────────────────────────────────
    console.log("▶ Phase 5: API Deletion Verification (Existing API route removed)");
    // Delete single-line endpoint .get("/item/list", ...) from cacheStressRoutes
    const deletedApiStress = originalStressRoutes.replace(
      '  .get("/item/list", (c) => c.json({ items: [] }))',
      "",
    );
    assert(deletedApiStress !== originalStressRoutes, "Failed to locate /item/list route for deletion test");
    fs.writeFileSync(STRESS_ROUTES_PATH, deletedApiStress, "utf-8");

    const deleteApiRun = runDocsCommand();
    results.deleteApiRunTimeMs = deleteApiRun.durationMs;
    console.log(`  ✓ Generation after deleting API completed in ${deleteApiRun.durationMs}ms`);

    const deleteApiSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    assert(
      !deleteApiSpec.paths["/api/stress/item/list"],
      "Expected /api/stress/item/list to be completely deleted from OpenAPI spec after route removal!",
    );
    assert.strictEqual(
      countEndpoints(deleteApiSpec),
      endpointCount - 1,
      `Endpoint count must decrease by exactly 1 (expected ${endpointCount - 1}) after API deletion!`,
    );
    console.log("  ✓ API deletion cache behavior PASSED (stale route cleanly evicted)\n");

    // ── PHASE 6: API REPLACED TEST (OLD DELETED, NEW ADDED) ───────────────────
    console.log("▶ Phase 6: API Replacement Verification (Old API deleted, brand new API added in same file)");
    // Replace .get("/order/list", ...) with .post("/order/advanced-search", ...)
    const replacedApiStress = originalStressRoutes.replace(
      '  .get("/order/list", (c) => c.json({ orders: [] }))',
      '  .post("/order/advanced-search", zValidator("json", simpleSchema), (c) => c.json({ search: "advanced" }))',
    );
    assert(replacedApiStress !== originalStressRoutes, "Failed to locate /order/list route for replacement test");
    fs.writeFileSync(STRESS_ROUTES_PATH, replacedApiStress, "utf-8");

    const replaceApiRun = runDocsCommand();
    results.replaceApiRunTimeMs = replaceApiRun.durationMs;
    console.log(`  ✓ Generation after API replacement completed in ${replaceApiRun.durationMs}ms`);

    const replaceApiSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    assert(
      !replaceApiSpec.paths["/api/stress/order/list"],
      "Old route /api/stress/order/list must be completely removed after replacement!",
    );
    const advancedSearchOp = replaceApiSpec.paths["/api/stress/order/advanced-search"]?.post;
    assert(advancedSearchOp, "New replacement route /api/stress/order/advanced-search POST must be present in spec!");
    const advancedSchema = resolveSchema(replaceApiSpec, advancedSearchOp.requestBody?.content?.["application/json"]?.schema);
    assert.strictEqual(advancedSchema?.properties?.name?.type, "string", "New route input schema fields must match codebase");
    assert.strictEqual(
      countEndpoints(replaceApiSpec),
      endpointCount,
      "Endpoint count must match baseline after 1-for-1 replacement",
    );
    console.log("  ✓ API replacement cache behavior PASSED\n");

    // ── PHASE 7: NEW FILE ADDED TO CODEBASE TEST ─────────────────────────────
    console.log("▶ Phase 7: New Route File Added to Codebase & Chained");
    const dynamicFileContent = `
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const dynamicTestRoutes = new Hono()
  .get("/ping", (c) => c.json({ pong: true }))
  .post("/submit", zValidator("json", z.object({ code: z.string(), score: z.number().int() })), (c) => c.json({ success: true }, 201));
`;
    fs.writeFileSync(DYNAMIC_FILE_PATH, dynamicFileContent, "utf-8");

    // Restore stress routes first so we test purely the new file addition against baseline
    fs.writeFileSync(STRESS_ROUTES_PATH, originalStressRoutes, "utf-8");

    const modifiedIndex = originalIndexTs
      .replace(
        'import { edgeCaseRoutes } from "./routes/edgeCaseRoutes";',
        'import { edgeCaseRoutes } from "./routes/edgeCaseRoutes";\nimport { dynamicTestRoutes } from "./routes/dynamicTestRoutes";',
      )
      .replace(
        '.route("/edge", edgeCaseRoutes);',
        '.route("/edge", edgeCaseRoutes)\n  .route("/dynamic", dynamicTestRoutes);',
      );
    assert(modifiedIndex !== originalIndexTs, "Failed to inject dynamic test routes into index.ts");
    fs.writeFileSync(INDEX_TS_PATH, modifiedIndex, "utf-8");

    const newFileRun = runDocsCommand();
    results.newFileRunTimeMs = newFileRun.durationMs;
    console.log(`  ✓ Generation after adding brand new file completed in ${newFileRun.durationMs}ms`);

    const newFileSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    assert(newFileSpec.paths["/api/dynamic/ping"]?.get, "Expected brand new GET /api/dynamic/ping route from new file in spec!");
    const dynSubmitOp = newFileSpec.paths["/api/dynamic/submit"]?.post;
    assert(dynSubmitOp, "Expected brand new POST /api/dynamic/submit route from new file in spec!");
    const dynSubmitSchema = resolveSchema(newFileSpec, dynSubmitOp.requestBody?.content?.["application/json"]?.schema);
    assert.strictEqual(dynSubmitSchema?.properties?.code?.type, "string", "New file route field 'code' must be string");
    assert.strictEqual(
      countEndpoints(newFileSpec),
      endpointCount + 2,
      `Endpoint count must increase by exactly 2 (to ${endpointCount + 2}) when new route file is added!`,
    );
    console.log("  ✓ New file addition cache & AST discovery PASSED\n");

    // ── PHASE 8: FILE DELETED FROM CODEBASE TEST ─────────────────────────────
    console.log("▶ Phase 8: Route File Deleted from Codebase");
    // Restore index.ts (removing import and route chaining) and delete file from filesystem
    fs.writeFileSync(INDEX_TS_PATH, originalIndexTs, "utf-8");
    if (fs.existsSync(DYNAMIC_FILE_PATH)) {
      fs.unlinkSync(DYNAMIC_FILE_PATH);
    }

    const deleteFileRun = runDocsCommand();
    results.deleteFileRunTimeMs = deleteFileRun.durationMs;
    console.log(`  ✓ Generation after deleting route file completed in ${deleteFileRun.durationMs}ms`);

    const deleteFileSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    assert(!deleteFileSpec.paths["/api/dynamic/ping"], "Deleted file endpoint /api/dynamic/ping must disappear from spec!");
    assert(!deleteFileSpec.paths["/api/dynamic/submit"], "Deleted file endpoint /api/dynamic/submit must disappear!");
    assert.strictEqual(
      countEndpoints(deleteFileSpec),
      endpointCount,
      "Endpoint count must revert cleanly back to baseline after file deletion!",
    );
    console.log("  ✓ File deletion cache recovery PASSED\n");

    // ── PHASE 9: RECOVERY & BENCHMARK SUMMARY ────────────────────────────────
    console.log("▶ Phase 9: Final Clean Verification");
  } finally {
    // ALWAYS restore all source files to clean original baseline state
    fs.writeFileSync(STRESS_ROUTES_PATH, originalStressRoutes, "utf-8");
    fs.writeFileSync(VALIBOT_SCHEMA_PATH, originalValibotSchema, "utf-8");
    fs.writeFileSync(INDEX_TS_PATH, originalIndexTs, "utf-8");
    if (fs.existsSync(DYNAMIC_FILE_PATH)) {
      fs.unlinkSync(DYNAMIC_FILE_PATH);
    }
  }

  // Final confirmation run after restoring originals
  const recovery = runDocsCommand();
  const finalSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
  assert.strictEqual(
    finalSpec.paths["/api/stress/user/list"]?.get?.summary,
    "Retrieve all users",
    "Failed to revert summary on clean run",
  );

  console.log("\n==================================================================");
  console.log("🎉 ALL CACHING, FIELD ACCURACY & MUTATION TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("==================================================================");
  console.log("📊 Comprehensive Performance Benchmarks & Mutation Results:");
  console.log(`   • Total Baseline Endpoints      : ${results.totalEndpoints} endpoints`);
  console.log(`   • Cold Generation (No Cache)    : ${results.coldRunTimeMs} ms`);
  console.log(`   • Warm Generation (Group Cache) : ${results.warmRunTimeMs} ms  (~${Math.round(results.coldRunTimeMs! / Math.max(1, results.warmRunTimeMs!))}x faster!)`);
  console.log(`   • Granular Route Invalidation   : ${results.granularRunTimeMs} ms`);
  console.log(`   • Schema Cache Invalidation     : ${results.schemaInvalidateRunTimeMs} ms`);
  console.log(`   • Route Deletion Handling       : ${results.deleteApiRunTimeMs} ms  (Clean eviction)`);
  console.log(`   • Route Replacement Handling    : ${results.replaceApiRunTimeMs} ms  (Accurate substitution)`);
  console.log(`   • New File Addition Handling    : ${results.newFileRunTimeMs} ms  (+2 routes added)`);
  console.log(`   • File Deletion Handling        : ${results.deleteFileRunTimeMs} ms  (Reversion to baseline)`);
  console.log("==================================================================\n");
}

runCachingTestSuite().catch((err) => {
  console.error("\n❌ CACHING TEST SUITE FAILED:", err);
  process.exit(1);
});
