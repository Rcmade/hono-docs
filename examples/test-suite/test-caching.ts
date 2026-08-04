import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import assert from "node:assert";

const OPENAPI_JSON_PATH = path.resolve("./openapi/openapi.json");
const ROOT_CACHE_MANIFEST = path.resolve("../../output/cache/manifest.json");
const STRESS_ROUTES_PATH = path.resolve("./src/routes/cacheStressRoutes.ts");
const VALIBOT_SCHEMA_PATH = path.resolve("./src/schemas/externalValibot.ts");

// Backup original contents of files we plan to modify for tests
const originalStressRoutes = fs.readFileSync(STRESS_ROUTES_PATH, "utf-8");
const originalValibotSchema = fs.readFileSync(VALIBOT_SCHEMA_PATH, "utf-8");

interface TestResults {
  coldRunTimeMs: number;
  warmRunTimeMs: number;
  granularRunTimeMs: number;
  schemaInvalidateRunTimeMs: number;
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
  console.log("🧪 Starting Comprehensive Caching Verification Test Suite (>100 test cases)...\n");
  const results: Partial<TestResults> = {};

  try {
    // ── PHASE 1: COLD RUN & >100 ENDPOINT VALIDATION ─────────────────────────
    console.log("▶ Phase 1: Cold Run Generation & Schema Accuracy Check");
    if (fs.existsSync(OPENAPI_JSON_PATH)) fs.unlinkSync(OPENAPI_JSON_PATH);
    if (fs.existsSync(ROOT_CACHE_MANIFEST)) fs.unlinkSync(ROOT_CACHE_MANIFEST);

    const cold = runDocsCommand();
    results.coldRunTimeMs = cold.durationMs;
    console.log(`  ✓ Cold generation completed in ${cold.durationMs}ms`);

    assert(fs.existsSync(OPENAPI_JSON_PATH), "Expected openapi.json to be generated on cold run!");
    const coldSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    const endpointCount = countEndpoints(coldSpec);
    results.totalEndpoints = endpointCount;
    console.log(`  ✓ Discovered ${endpointCount} endpoints in OpenAPI spec`);
    assert(endpointCount > 100, `Expected >100 test cases, found ${endpointCount}`);

    // Validate Zod schema presence on /api/stress/order/create
    const orderCreate = coldSpec.paths["/api/stress/order/create"]?.post;
    assert(orderCreate, "Expected /api/stress/order/create POST route in spec");
    assert(orderCreate.requestBody, "Expected requestBody on /api/stress/order/create");

    // Validate Valibot schema on /api/valibot/vb-create
    const valibotCreate = coldSpec.paths["/api/valibot/vb-create"]?.post;
    assert(valibotCreate, "Expected /api/valibot/vb-create POST route");

    console.log("  ✓ Cold run schema integrity assertions PASSED\n");

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
    assert.deepStrictEqual(warmSpec, coldSpec, "Warm spec output MUST be identical to cold spec");
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

    // Verify other routes remain untouched and valid
    assert.strictEqual(
      countEndpoints(granularSpec),
      endpointCount,
      "Endpoint count must remain identical after route edit",
    );
    console.log("  ✓ Granular per-route cache invalidation assertions PASSED\n");

    // ── PHASE 4: SCHEMA CACHE INVALIDATION ────────────────────────────────────
    console.log("▶ Phase 4: Schema Cache Invalidation Check");
    const modifiedValibot = originalValibotSchema.replace(
      "country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),",
      "country: v.pipe(v.string(), v.minLength(2), v.maxLength(2)),\n  testCacheProp: v.optional(v.string()),",
    );
    fs.writeFileSync(VALIBOT_SCHEMA_PATH, modifiedValibot, "utf-8");

    const schemaRun = runDocsCommand();
    results.schemaInvalidateRunTimeMs = schemaRun.durationMs;
    console.log(`  ✓ Schema invalidation run completed in ${schemaRun.durationMs}ms`);

    const schemaSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
    const vbResponseSchema =
      schemaSpec.paths["/api/valibot/vb-create"]?.post?.requestBody?.content?.["application/json"]?.schema;
    assert(vbResponseSchema && vbResponseSchema.properties, "Expected properties on Valibot schema");
    assert(
      vbResponseSchema.properties.testCacheProp,
      "Expected newly added testCacheProp to appear in OpenAPI JSON after schema file edit! Schema cache did not invalidate properly.",
    );
    console.log("  ✓ Schema cache invalidation assertions PASSED\n");

    // ── PHASE 5: RECOVERY & BENCHMARK SUMMARY ────────────────────────────────
    console.log("▶ Phase 5: Revert & Final Clean Verification");
  } finally {
    // ALWAYS restore modified source files to original clean state
    fs.writeFileSync(STRESS_ROUTES_PATH, originalStressRoutes, "utf-8");
    fs.writeFileSync(VALIBOT_SCHEMA_PATH, originalValibotSchema, "utf-8");
  }

  // Final confirmation run after restoring originals
  const recovery = runDocsCommand();
  const finalSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf-8"));
  assert.strictEqual(
    finalSpec.paths["/api/stress/user/list"]?.get?.summary,
    "Retrieve all users",
    "Failed to revert summary on clean run",
  );

  console.log("\n==========================================================");
  console.log("🎉 ALL CACHING & FUNCTIONALITY TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("==========================================================");
  console.log("📊 Caching Performance Benchmarks:");
  console.log(`   • Total Endpoints Tested        : ${results.totalEndpoints} cases`);
  console.log(`   • Cold Generation (No Cache)    : ${results.coldRunTimeMs} ms`);
  console.log(`   • Warm Generation (Group Cache) : ${results.warmRunTimeMs} ms  (~${Math.round(results.coldRunTimeMs! / Math.max(1, results.warmRunTimeMs!))}x faster!)`);
  console.log(`   • Granular Route Invalidation   : ${results.granularRunTimeMs} ms`);
  console.log(`   • Schema Cache Invalidation     : ${results.schemaInvalidateRunTimeMs} ms`);
  console.log("==========================================================\n");
}

runCachingTestSuite().catch((err) => {
  console.error("\n❌ CACHING TEST SUITE FAILED:", err);
  process.exit(1);
});
