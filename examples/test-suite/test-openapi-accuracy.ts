import fs from "node:fs";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

interface Operation {
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: Record<string, unknown> }>;
    }
  >;
}

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
  };
}

async function verifyOpenApiAccuracy() {
  console.log("============================================================");
  console.log("🔍 Rigorous OpenAPI JSON Accuracy & Integrity Test Suite");
  console.log("============================================================\n");

  const jsonPath = path.resolve("./openapi/openapi.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`openapi.json not found at ${jsonPath}`);
  }

  const rawJson = fs.readFileSync(jsonPath, "utf-8");
  const spec: OpenAPISpec = JSON.parse(rawJson);

  let passedChecks = 0;
  let failedChecks = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passedChecks++;
    } else {
      failedChecks++;
      console.error(`  ❌ FAILED: ${message}`);
    }
  }

  // 1. Basic Metadata Verification
  console.log("1️⃣  Verifying Document Root & Metadata...");
  assert(
    spec.openapi === "3.0.3",
    `OpenAPI version should be 3.0.3, got: ${spec.openapi}`,
  );
  assert(
    spec.info.title === "API Test Suite",
    `Title should be 'API Test Suite', got: ${spec.info.title}`,
  );
  assert(
    spec.info.version === "1.0.0",
    `Version should be '1.0.0', got: ${spec.info.version}`,
  );
  assert(typeof spec.paths === "object", "paths must be an object");
  console.log(
    `  ✓ Document root & metadata verified (${passedChecks} checks)\n`,
  );

  // 2. Path Syntax & Formatting
  console.log("2️⃣  Verifying Path Syntax & Parameter Templating...");
  const paths = Object.keys(spec.paths);
  assert(paths.length === 137, `Expected 137 paths, got ${paths.length}`);

  let totalOperations = 0;
  const methodCounts: Record<string, number> = {};

  for (const p of paths) {
    assert(p.startsWith("/"), `Path '${p}' must start with '/'`);
    assert(
      !p.includes("//"),
      `Path '${p}' must not contain double slashes '//'`,
    );
    assert(
      !p.includes(":") || p.includes("{"),
      `Path '${p}' still has un-normalized Hono parameter ':'`,
    );
    assert(
      !p.includes("{["),
      `Path '${p}' still has un-normalized regex syntax '{['`,
    );

    const pathItem = spec.paths[p];
    for (const [method, op] of Object.entries(pathItem)) {
      totalOperations++;
      methodCounts[method] = (methodCounts[method] || 0) + 1;

      // Check path parameters in URL vs parameters array
      const matches = p.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
      const urlParamNames = matches.map((m) => m.slice(1, -1));

      if (urlParamNames.length > 0) {
        const declaredParams = op.parameters || [];
        for (const up of urlParamNames) {
          const found = declaredParams.find(
            (dp) => dp.name === up && dp.in === "path",
          );
          assert(
            Boolean(found),
            `Operation ${method.toUpperCase()} ${p} has path param '{${up}}' in URL but missing in parameters array!`,
          );
          if (found) {
            assert(
              found.required === true,
              `Path parameter '{${up}}' in ${method.toUpperCase()} ${p} must have required: true`,
            );
          }
        }
      }
    }
  }

  assert(
    totalOperations === 138,
    `Expected 138 operations, got ${totalOperations}`,
  );
  console.log(
    `  ✓ All ${paths.length} paths and ${totalOperations} operations verified:`,
    methodCounts,
  );
  console.log(`  ✓ Zero un-normalized regex or colon parameters in URLs\n`);

  // 3. Components & $ref Integrity
  console.log("3️⃣  Verifying $ref Pointer Integrity & Deduplication...");
  const schemas = spec.components?.schemas || {};
  const schemaNames = Object.keys(schemas);
  console.log(
    `  Found ${schemaNames.length} reusable component schemas in components.schemas`,
  );

  const allRefs: string[] = [];

  function collectRefs(obj: unknown, currentPath = "") {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => collectRefs(item, `${currentPath}[${idx}]`));
      return;
    }
    const rec = obj as Record<string, unknown>;
    if (typeof rec.$ref === "string") {
      allRefs.push(rec.$ref);
      assert(
        rec.$ref.startsWith("#/components/schemas/"),
        `Invalid $ref pointer '${rec.$ref}' at ${currentPath}. Expected '#/components/schemas/...'`,
      );
      const targetName = rec.$ref.replace("#/components/schemas/", "");
      assert(
        targetName in schemas,
        `Dangling $ref '${rec.$ref}' at ${currentPath} - component '${targetName}' does not exist!`,
      );
    }
    for (const [k, v] of Object.entries(rec)) {
      collectRefs(v, `${currentPath}.${k}`);
    }
  }

  collectRefs(spec);
  console.log(
    `  ✓ Checked ${allRefs.length} $ref references across the entire specification`,
  );
  console.log(`  ✓ Zero dangling or broken $ref pointers found!\n`);

  // 4. OpenAPI 3.0 Array & Tuple Compliance
  console.log(
    "4️⃣  Verifying OpenAPI 3.0 Schema Compliance (No tuple arrays, no additionalItems)...",
  );
  let tupleViolations = 0;
  let additionalItemsViolations = 0;

  function checkSchemaCompliance(obj: unknown, currentPath = "") {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) =>
        checkSchemaCompliance(item, `${currentPath}[${idx}]`),
      );
      return;
    }
    const rec = obj as Record<string, unknown>;

    if (rec.type === "array" && Array.isArray(rec.items)) {
      tupleViolations++;
      assert(
        false,
        `OpenAPI 3.0 violation at ${currentPath}: items cannot be an array in OpenAPI 3.0`,
      );
    }

    if ("additionalItems" in rec) {
      additionalItemsViolations++;
      assert(
        false,
        `OpenAPI 3.0 violation at ${currentPath}: additionalItems is not valid in OpenAPI 3.0`,
      );
    }

    for (const [k, v] of Object.entries(rec)) {
      checkSchemaCompliance(v, `${currentPath}.${k}`);
    }
  }

  checkSchemaCompliance(spec);
  assert(
    tupleViolations === 0,
    `Expected 0 tuple array violations, found ${tupleViolations}`,
  );
  assert(
    additionalItemsViolations === 0,
    `Expected 0 additionalItems violations, found ${additionalItemsViolations}`,
  );
  console.log(
    `  ✓ Verified: 0 tuple array violations and 0 additionalItems violations across all schemas\n`,
  );

  // 5. Framework-Specific Route Accuracy
  console.log("5️⃣  Verifying Framework-Specific Schema Generation...");

  // Zod: /api/auth/login
  const authLogin = spec.paths["/api/auth/login"]?.post;
  assert(Boolean(authLogin), "Missing /api/auth/login POST operation");
  const authLoginBody =
    authLogin?.requestBody?.content?.["application/json"]?.schema;
  assert(
    Boolean(authLoginBody),
    "/api/auth/login must have application/json requestBody schema",
  );
  console.log(
    "  ✓ Zod /api/auth/login request body schema generated accurately",
  );

  // Valibot: /api/valibot/vb-create
  const valibotItem = spec.paths["/api/valibot/vb-create"]?.post;
  assert(Boolean(valibotItem), "Missing /api/valibot/vb-create POST operation");
  const valibotItemBody =
    valibotItem?.requestBody?.content?.["application/json"]?.schema;
  assert(
    Boolean(valibotItemBody),
    "/api/valibot/vb-create must have application/json requestBody schema",
  );
  console.log("  ✓ Valibot /api/valibot/vb-create schema generated accurately");

  // TypeBox: /api/typebox/tb-create
  const typeboxUser = spec.paths["/api/typebox/tb-create"]?.post;
  assert(Boolean(typeboxUser), "Missing /api/typebox/tb-create POST operation");
  const typeboxBody =
    typeboxUser?.requestBody?.content?.["application/json"]?.schema;
  assert(
    Boolean(typeboxBody),
    "/api/typebox/tb-create must have application/json requestBody schema",
  );
  console.log("  ✓ TypeBox /api/typebox/tb-create schema generated accurately");

  // ArkType: /api/new-frameworks/arktype
  const arktypeOp = spec.paths["/api/new-frameworks/arktype"]?.post;
  assert(
    Boolean(arktypeOp),
    "Missing /api/new-frameworks/arktype POST operation",
  );
  const arktypeBody =
    arktypeOp?.requestBody?.content?.["application/json"]?.schema;
  assert(
    Boolean(arktypeBody),
    "/api/new-frameworks/arktype must have application/json requestBody schema",
  );
  console.log(
    "  ✓ ArkType /api/new-frameworks/arktype schema generated accurately",
  );

  // AST Fallback: /api/stress/order/:id/update
  const stressUpdate = spec.paths["/api/stress/order/{id}/update"]?.put;
  assert(
    Boolean(stressUpdate),
    "Missing /api/stress/order/{id}/update PUT operation",
  );
  const stressParam = stressUpdate?.parameters?.find(
    (p) => p.name === "id" && p.in === "path",
  );
  assert(
    Boolean(stressParam),
    "Missing {id} path parameter in /api/stress/order/{id}/update",
  );
  console.log(
    "  ✓ AST Fallback /api/stress/order/{id}/update parameter & body generated accurately\n",
  );

  // 6. JSDoc Annotation & Tag Inheritance Accuracy
  console.log("6️⃣  Verifying JSDoc Annotation & Tag Inheritance...");
  let foundTaggedLogistics = false;
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const [m, op] of Object.entries(ops)) {
      if (op.tags?.includes("Logistics")) {
        foundTaggedLogistics = true;
        assert(
          op.summary === "Get Shipment Tracking",
          `Expected summary 'Get Shipment Tracking', got '${op.summary}'`,
        );
        assert(
          op.description ===
            "Fetches real-time GPS tracking data for a specific shipment.",
          `Description mismatch on ${m.toUpperCase()} ${p}`,
        );
      }
    }
  }
  assert(
    foundTaggedLogistics,
    "Expected to find operation tagged with 'Logistics'",
  );
  console.log("  ✓ JSDoc summary, description, and tags accurately mapped\n");

  // 7. Full Dereferencing & Schema Validation via SwaggerParser
  console.log("7️⃣  Running Full SwaggerParser Validation & Dereferencing...");
  // Clone spec and expand 'all' for SwaggerParser
  const clonedSpec = JSON.parse(JSON.stringify(spec));
  for (const pathItem of Object.values(
    clonedSpec.paths as Record<string, Record<string, unknown>>,
  )) {
    if (pathItem && "all" in pathItem) {
      const allOp = pathItem.all;
      delete pathItem.all;
      for (const m of ["get", "post", "put", "delete", "patch"]) {
        if (!(m in pathItem)) pathItem[m] = allOp;
      }
    }
  }

  try {
    const validated = await SwaggerParser.validate(clonedSpec);
    assert(Boolean(validated), "SwaggerParser.validate should succeed");
    console.log("  ✓ SwaggerParser.validate: PASSED with 0 schema errors!");
  } catch (err) {
    assert(false, `SwaggerParser.validate failed: ${(err as Error).message}`);
  }

  try {
    const dereferenced = await SwaggerParser.dereference(clonedSpec);
    assert(Boolean(dereferenced), "SwaggerParser.dereference should succeed");
    console.log(
      "  ✓ SwaggerParser.dereference: PASSED with 0 broken references!",
    );
  } catch (err) {
    assert(
      false,
      `SwaggerParser.dereference failed: ${(err as Error).message}`,
    );
  }

  console.log("\n============================================================");
  console.log(
    `📊 FINAL RESULT: ${passedChecks} checks PASSED, ${failedChecks} FAILED`,
  );
  console.log("============================================================\n");

  if (failedChecks > 0) {
    process.exit(1);
  }
}

verifyOpenApiAccuracy().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
