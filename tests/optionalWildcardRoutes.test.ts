import { Project } from "ts-morph";
import * as assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3 } from "openapi-types";
import { generateOpenApi } from "../src/core/generateOpenApi";
import { generateTypes } from "../src/core/generateTypes";
import {
  expandHonoPath,
  toOpenApiPath,
  generateDefaultSummary,
} from "../src/utils/format";
import type { HonoDocsConfig } from "../src/types";

interface SpecRunnerOptions {
  project: Project;
  rootPath: string;
  fileName: string;
  sourceCode: string;
  wildcardParamName?: string;
  cleanupList: string[];
}

/**
 * Reusable typed test helper: creates route file, generates snapshot types,
 * runs OpenAPI generation, asserts SwaggerParser structural validity, and returns paths.
 */
async function compileAndGeneratePaths(
  options: SpecRunnerOptions,
): Promise<Record<string, OpenAPIV3.PathItemObject>> {
  const {
    project,
    rootPath,
    fileName,
    sourceCode,
    wildcardParamName,
    cleanupList,
  } = options;
  const filePath = path.join(rootPath, `src/${fileName}.ts`);
  cleanupList.push(filePath);

  project.createSourceFile(filePath, sourceCode, { overwrite: true });
  await project.save();

  const config: HonoDocsConfig = {
    tsConfigPath: "./tsconfig.json",
    openApiVersion: "3.0",
    wildcardParamName,
    openApi: {
      openapi: "3.0.0",
      info: { title: `${fileName} API`, version: "1.0.0" },
    },
    outputs: { openApiJson: "./openapi.json" },
    apis: [
      {
        name: "TestGroup",
        apiPrefix: "",
        appTypePath: `src/${fileName}.ts`,
      },
    ],
  };

  const typeSnapshot = await generateTypes({
    config,
    rootPath,
    apiGroup: config.apis[0],
    fileName,
    project,
    libDir: rootPath,
    outputRoot: path.join(rootPath, ".hono-docs"),
  });

  const genResult = await generateOpenApi({
    config,
    snapshotPath: typeSnapshot,
    fileName,
    project,
    rootPath,
    libDir: rootPath,
    outputRoot: path.join(rootPath, ".hono-docs"),
    apiGroup: config.apis[0],
  });

  const rawJson = fs.readFileSync(genResult.openApiPath, "utf-8");
  const parsed = JSON.parse(rawJson);
  await SwaggerParser.validate(JSON.parse(rawJson));
  return parsed.paths;
}

function asParam(
  param: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject | undefined,
): OpenAPIV3.ParameterObject {
  assert.ok(param, "Expected parameter to be defined");
  assert.ok(
    !("$ref" in param),
    "Expected inline ParameterObject, got ReferenceObject",
  );
  return param as OpenAPIV3.ParameterObject;
}

async function runTests() {
  console.log(
    "🧪 Running Optional Route Parameters & Wildcard Test Suite...\n",
  );

  const cleanupList: string[] = [];

  try {
    // ── TEST 1: Unit tests for expandHonoPath ──────────────────────────────────
    console.log("Checking Case 1: expandHonoPath unit cases...");
    {
      const r1 = expandHonoPath("/api/items/:id/files/:name?");
      assert.strictEqual(r1.length, 2);
      assert.strictEqual(r1[0].path, "/api/items/{id}/files");
      assert.deepStrictEqual(r1[0].paramNames, ["id"]);
      assert.strictEqual(r1[1].path, "/api/items/{id}/files/{name}");
      assert.deepStrictEqual(r1[1].paramNames, ["id", "name"]);

      const r2 = expandHonoPath("/wild/*");
      assert.strictEqual(r2.length, 1);
      assert.strictEqual(r2[0].path, "/wild/{wildcard}");
      assert.deepStrictEqual(r2[0].paramNames, ["wildcard"]);

      const r3 = expandHonoPath("/wild/*", { wildcardParam: "path" });
      assert.strictEqual(r3.length, 1);
      assert.strictEqual(r3[0].path, "/wild/{path}");
      assert.deepStrictEqual(r3[0].paramNames, ["path"]);

      const r4 = expandHonoPath("/items/:cat?/:sub?");
      assert.strictEqual(r4.length, 3);
      assert.strictEqual(r4[0].path, "/items");
      assert.deepStrictEqual(r4[0].paramNames, []);
      assert.strictEqual(r4[1].path, "/items/{cat}");
      assert.deepStrictEqual(r4[1].paramNames, ["cat"]);
      assert.strictEqual(r4[2].path, "/items/{cat}/{sub}");
      assert.deepStrictEqual(r4[2].paramNames, ["cat", "sub"]);

      const r5 = expandHonoPath("/:id?");
      assert.strictEqual(r5.length, 2);
      assert.strictEqual(r5[0].path, "/");
      assert.deepStrictEqual(r5[0].paramNames, []);
      assert.strictEqual(r5[1].path, "/{id}");
      assert.deepStrictEqual(r5[1].paramNames, ["id"]);

      const r6 = expandHonoPath("/archive/:year{[0-9]{4}}/:month{[0-9]{2}}?");
      assert.strictEqual(r6.length, 2);
      assert.strictEqual(r6[0].path, "/archive/{year}");
      assert.deepStrictEqual(r6[0].paramNames, ["year"]);
      assert.strictEqual(r6[1].path, "/archive/{year}/{month}");
      assert.deepStrictEqual(r6[1].paramNames, ["year", "month"]);

      // Regex with ? quantifier inside pattern must NOT be treated as optional
      const r7 = expandHonoPath("/post/:id/:code{[a-z]?}");
      assert.strictEqual(r7.length, 1);
      assert.strictEqual(r7[0].path, "/post/{id}/{code}");
      assert.deepStrictEqual(r7[0].paramNames, ["id", "code"]);

      // Regex with ? quantifier inside pattern AND trailing ? must be treated as optional
      const r8 = expandHonoPath("/post/:id/:code{[a-z]?}?");
      assert.strictEqual(r8.length, 2);
      assert.strictEqual(r8[0].path, "/post/{id}");
      assert.deepStrictEqual(r8[0].paramNames, ["id"]);
      assert.strictEqual(r8[1].path, "/post/{id}/{code}");
      assert.deepStrictEqual(r8[1].paramNames, ["id", "code"]);

      // Non-trailing optional param cannot terminate early
      const r9 = expandHonoPath("/items/:id?/details");
      assert.strictEqual(r9.length, 1);
      assert.strictEqual(r9[0].path, "/items/{id}/details");
      assert.deepStrictEqual(r9[0].paramNames, ["id"]);

      // Multi-wildcard numbered parameters
      const r10 = expandHonoPath("/files/*/sub/*");
      assert.strictEqual(r10.length, 1);
      assert.strictEqual(r10[0].path, "/files/{wildcard1}/sub/{wildcard2}");
      assert.deepStrictEqual(r10[0].paramNames, ["wildcard1", "wildcard2"]);

      console.log(
        "  ✓ Case 1 PASSED: expandHonoPath correctly expands routes and parameter names",
      );
    }

    // ── TEST 2: Unit tests for toOpenApiPath and generateDefaultSummary ─────────
    console.log(
      "\nChecking Case 2: toOpenApiPath and generateDefaultSummary...",
    );
    {
      assert.strictEqual(
        toOpenApiPath("/api/items/:id/files/:name?"),
        "/api/items/{id}/files/{name}",
      );
      assert.strictEqual(toOpenApiPath("/api/wild/*"), "/api/wild/{wildcard}");
      assert.strictEqual(
        toOpenApiPath("/api/wild/*", { wildcardParam: "path" }),
        "/api/wild/{path}",
      );

      assert.strictEqual(
        generateDefaultSummary("get", "/api/items/{id}/files"),
        "Get Items By Id Files",
      );
      assert.strictEqual(
        generateDefaultSummary("get", "/api/items/{id}/files/{name}"),
        "Get Items By Id Files By Name",
      );
      assert.strictEqual(
        generateDefaultSummary("get", "/api/items/wild/{wildcard}"),
        "Get Items Wild By Wildcard",
      );

      console.log(
        "  ✓ Case 2 PASSED: toOpenApiPath and generateDefaultSummary produce clean templates & titles",
      );
    }

    // Common project setup for E2E tests
    const rootPath = path.resolve("examples/test-suite");
    const tsConfigPath = path.resolve(rootPath, "tsconfig.json");
    const project = new Project({ tsConfigFilePath: tsConfigPath });

    // ── TEST 3: Full End-to-End Issue #11 Reproduction ─────────────────────────
    console.log("\nChecking Case 3: End-to-End Issue #11 Reproduction...");
    {
      const openApiPaths = await compileAndGeneratePaths({
        project,
        rootPath,
        fileName: "e2e_optional_wildcard",
        cleanupList,
        sourceCode: `
import { Hono } from "hono";

/**
 * @tag Storage
 */
const items = new Hono()
  /**
   * @description Retrieve files by optional name
   */
  .get("/:id/files/:name?", (c) => c.json({ ok: true }))
  /**
   * @tag Streaming
   * @description Catch-all wildcard stream handler
   */
  .get("/wild/*", (c) => c.text("w"));

const app = new Hono().basePath("/api").route("/items", items);

export type AppType = typeof app;
export default app;
`,
      });

      // 1. Verify paths exist
      assert.ok(
        openApiPaths["/api/items/{id}/files"],
        "Expected path /api/items/{id}/files to exist",
      );
      assert.ok(
        openApiPaths["/api/items/{id}/files/{name}"],
        "Expected path /api/items/{id}/files/{name} to exist",
      );
      assert.ok(
        openApiPaths["/api/items/wild/{wildcard}"],
        "Expected path /api/items/wild/{wildcard} to exist",
      );

      // 2. Verify no malformed keys exist
      assert.strictEqual(
        openApiPaths["/api/items/{id}/files/{name}?"],
        undefined,
        "No trailing ? path key allowed",
      );
      assert.strictEqual(
        openApiPaths["/api/items/wild/*"],
        undefined,
        "No literal * path key allowed",
      );

      // 3. Verify parameter scoping in /api/items/{id}/files (only id)
      const filesOp = openApiPaths["/api/items/{id}/files"].get!;
      assert.strictEqual(filesOp.summary, "Get Items By Id Files");
      assert.strictEqual(
        filesOp.description,
        "Retrieve files by optional name",
      );
      assert.deepStrictEqual(filesOp.tags, ["Storage"]);
      assert.strictEqual(
        filesOp.parameters?.length,
        1,
        "Only 1 parameter expected in base path",
      );
      assert.strictEqual(asParam(filesOp.parameters?.[0]).name, "id");
      assert.strictEqual(asParam(filesOp.parameters?.[0]).in, "path");
      assert.strictEqual(asParam(filesOp.parameters?.[0]).required, true);

      // 4. Verify parameter scoping in /api/items/{id}/files/{name} (id AND name)
      const filesWithNameOp = openApiPaths["/api/items/{id}/files/{name}"].get!;
      assert.strictEqual(
        filesWithNameOp.summary,
        "Get Items By Id Files By Name",
      );
      assert.strictEqual(
        filesWithNameOp.description,
        "Retrieve files by optional name",
      );
      assert.deepStrictEqual(filesWithNameOp.tags, ["Storage"]);
      assert.strictEqual(
        filesWithNameOp.parameters?.length,
        2,
        "2 parameters expected when name is included",
      );
      assert.strictEqual(asParam(filesWithNameOp.parameters?.[0]).name, "id");
      assert.strictEqual(asParam(filesWithNameOp.parameters?.[1]).name, "name");
      assert.strictEqual(asParam(filesWithNameOp.parameters?.[1]).in, "path");
      assert.strictEqual(
        asParam(filesWithNameOp.parameters?.[1]).required,
        true,
      );

      // 5. Verify wildcard parameter injection in /api/items/wild/{wildcard}
      const wildOp = openApiPaths["/api/items/wild/{wildcard}"].get!;
      assert.strictEqual(wildOp.summary, "Get Items Wild By Wildcard");
      assert.strictEqual(
        wildOp.description,
        "Catch-all wildcard stream handler",
      );
      assert.deepStrictEqual(wildOp.tags, ["Storage", "Streaming"]);
      assert.strictEqual(
        wildOp.parameters?.length,
        1,
        "Wildcard route must have 1 injected path parameter",
      );
      assert.strictEqual(asParam(wildOp.parameters?.[0]).name, "wildcard");
      assert.strictEqual(asParam(wildOp.parameters?.[0]).in, "path");
      assert.strictEqual(asParam(wildOp.parameters?.[0]).required, true);

      console.log(
        "  ✓ Case 3 PASSED: Issue #11 end-to-end reproduction verified and validated with SwaggerParser!",
      );
    }

    // ── TEST 4: Configurable wildcard parameter name ────────────────────────────
    console.log("\nChecking Case 4: Configurable wildcardParamName...");
    {
      const openApiPaths = await compileAndGeneratePaths({
        project,
        rootPath,
        fileName: "e2e_custom_wildcard",
        wildcardParamName: "assetPath",
        cleanupList,
        sourceCode: `
import { Hono } from "hono";

const app = new Hono().get("/assets/*", (c) => c.text("asset"));
export type AppType = typeof app;
export default app;
`,
      });

      assert.ok(
        openApiPaths["/assets/{assetPath}"],
        "Expected path /assets/{assetPath}",
      );
      const op = openApiPaths["/assets/{assetPath}"].get!;
      assert.strictEqual(asParam(op.parameters?.[0]).name, "assetPath");
      assert.strictEqual(asParam(op.parameters?.[0]).in, "path");
      assert.strictEqual(asParam(op.parameters?.[0]).required, true);
      assert.strictEqual(
        asParam(op.parameters?.[0]).description,
        "Catch-all wildcard path parameter",
      );

      console.log(
        "  ✓ Case 4 PASSED: Custom wildcardParamName correctly applied and validated!",
      );
    }

    // ── TEST 5: Multiple optional parameters and regex constraints ───────────────
    console.log(
      "\nChecking Case 5: Multiple optional parameters and regex constraints...",
    );
    {
      const openApiPaths = await compileAndGeneratePaths({
        project,
        rootPath,
        fileName: "e2e_multi_optional",
        cleanupList,
        sourceCode: `
import { Hono } from "hono";

const app = new Hono()
  .get("/archive/:year{[0-9]{4}}/:month{[0-9]{2}}?", (c) => c.text("archive"))
  .get("/shop/:dept?/:item?", (c) => c.text("shop"));

export type AppType = typeof app;
export default app;
`,
      });

      assert.ok(openApiPaths["/archive/{year}"]);
      assert.ok(openApiPaths["/archive/{year}/{month}"]);
      assert.strictEqual(
        openApiPaths["/archive/{year}"].get!.parameters?.length,
        1,
      );
      assert.strictEqual(
        openApiPaths["/archive/{year}/{month}"].get!.parameters?.length,
        2,
      );

      assert.ok(openApiPaths["/shop"]);
      assert.ok(openApiPaths["/shop/{dept}"]);
      assert.ok(openApiPaths["/shop/{dept}/{item}"]);

      console.log(
        "  ✓ Case 5 PASSED: Multi-optional expansion and regex constraints verified!",
      );
    }

    console.log(
      "\n🎉 ALL OPTIONAL PARAMETER & WILDCARD TESTS PASSED WITH 100% SUCCESS!",
    );
  } finally {
    // Guaranteed cleanup of any temporary files
    for (const f of cleanupList) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignore unlink errors during cleanup
        }
      }
    }
  }
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
