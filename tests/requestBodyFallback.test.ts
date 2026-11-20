import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Project } from "ts-morph";
import { genRequestBody } from "../src/utils/requestBody";
import { genParameters } from "../src/utils/parameters";
import { v30Adapter } from "../src/openapi/adapters/v3-0";
import { v31Adapter } from "../src/openapi/adapters/v3-1";
import type { OpenAPIV3 } from "openapi-types";

async function runTests() {
  console.log("🧪 Running RequestBody & Parameters Fallback Test Suite...\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hono-docs-fallback-"));
  const srcDir = path.join(tmpDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  try {
    const code = `
    import { Hono } from "hono";
    import { zValidator } from "@hono/zod-validator";
    import { z } from "zod";

    export const loginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    });

    export const searchSchema = z.object({
      q: z.string(),
      limit: z.number().optional(),
    });

    export const filterSchema = z.object({
      from: z.string().optional(),
      to: z.number().optional(),
    });

    export const defaultFilterSchema = z.object({
      sort: z.string().default("asc"),
      limit: z.number().default(20),
    });

    export const mixedFilterSchema = z.object({
      sort: z.string().default("asc"),
      q: z.string(),
    });

    const app = new Hono()
      .post("/api/auth/login", zValidator("json", loginSchema), (c) => c.json({ ok: true }))
      .post("/api/filter", zValidator("json", filterSchema), (c) => c.json({ ok: true }))
      .post("/api/filter-defaults", zValidator("json", defaultFilterSchema), (c) => c.json({ ok: true }))
      .post("/api/filter-mixed", zValidator("json", mixedFilterSchema), (c) => c.json({ ok: true }))
      .get("/api/search", zValidator("query", searchSchema), (c) => c.json({ ok: true }))
      .get("/api/ping", (c) => c.text("pong"));

    // Simulating collapsed AppType where input is empty {}
    export type AppType = {
      "/api/auth/login": {
        $post: {
          input: {};
          output: { ok: boolean };
          outputFormat: "json";
          status: 200;
        };
      };
      "/api/filter": {
        $post: {
          input: {};
          output: { ok: boolean };
          outputFormat: "json";
          status: 200;
        };
      };
      "/api/filter-defaults": {
        $post: {
          input: {};
          output: { ok: boolean };
          outputFormat: "json";
          status: 200;
        };
      };
      "/api/filter-mixed": {
        $post: {
          input: {};
          output: { ok: boolean };
          outputFormat: "json";
          status: 200;
        };
      };
      "/api/search": {
        $get: {
          input: {};
          output: { ok: boolean };
          outputFormat: "json";
          status: 200;
        };
      };
      "/api/ping": {
        $get: {
          input: {};
          output: string;
          outputFormat: "text";
          status: 200;
        };
      };
    };

    // Standalone route types exercise the TypeScript-schema fallback directly.
    export type TypeOnlyNullableRoute = {
      input: { json: { from?: string; to?: number } | null };
      output: { ok: boolean };
      outputFormat: "json";
      status: 200;
    };
    export type TypeOnlyPrimitiveRoute = {
      input: { json: string };
      output: { ok: boolean };
      outputFormat: "json";
      status: 200;
    };
    export type TypeOnlyFormRoute = {
      input: { form: { from?: string; to?: number } };
      output: { ok: boolean };
      outputFormat: "json";
      status: 200;
    };
    export type TypeOnlyUnknownRoute = {
      input: { json: unknown };
      output: { ok: boolean };
      outputFormat: "json";
      status: 200;
    };
  `;

  const indexPath = path.join(srcDir, "index.ts");
  fs.writeFileSync(indexPath, code, "utf-8");

  const testSuiteNodeModules = path.resolve(
    process.cwd(),
    "examples/test-suite/node_modules",
  );
  if (fs.existsSync(testSuiteNodeModules)) {
    fs.symlinkSync(testSuiteNodeModules, path.join(tmpDir, "node_modules"), "junction");
  }

  // Create a minimal tsconfig.json in tmpDir so ts-morph and jiti resolve cleanly
  const tsConfigPath = path.join(tmpDir, "tsconfig.json");
  fs.writeFileSync(
    tsConfigPath,
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "node",
        esModuleInterop: true,
        strictNullChecks: true,
      },
    }),
    "utf-8",
  );

  const project = new Project({
    tsConfigFilePath: tsConfigPath,
  });

  const sf = project.addSourceFileAtPath(indexPath);
  const typeChecker = project.getTypeChecker();
  const typeAlias = sf.getTypeAliasOrThrow("AppType");
  const appType = typeAlias.getType();

  console.log("Checking Case 1: POST /api/auth/login with collapsed input: {}...");
  const loginRouteType = appType.getPropertyOrThrow("/api/auth/login");
  const loginPostSymbol = typeChecker
    .getTypeOfSymbolAtLocation(loginRouteType, typeAlias)
    .getPropertyOrThrow("$post");
  const loginPostType = typeChecker.getTypeOfSymbolAtLocation(
    loginPostSymbol,
    typeAlias,
  );

  const reqBody = await genRequestBody({
    type: loginPostType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/auth/login",
    method: "post",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });

  assert(reqBody !== null, "RequestBody should not be null despite collapsed input");
  assert(
    reqBody.content && reqBody.content["application/json"],
    "RequestBody must contain application/json",
  );
  const jsonSchema = reqBody.content["application/json"].schema as OpenAPIV3.SchemaObject;
  assert(jsonSchema.properties?.email, "Schema must contain email property");
  assert(jsonSchema.properties?.password, "Schema must contain password property");
  assert.strictEqual(reqBody.required, true, "Login body must be marked required");
  console.log("  ✓ Case 1 PASSED: Collapsed input fallback rescued JSON body schema from AST!\n");

  console.log("Checking Case 1b: POST /api/filter with all-optional body...");
  const filterRouteType = appType.getPropertyOrThrow("/api/filter");
  const filterPostSymbol = typeChecker
    .getTypeOfSymbolAtLocation(filterRouteType, typeAlias)
    .getPropertyOrThrow("$post");
  const filterPostType = typeChecker.getTypeOfSymbolAtLocation(
    filterPostSymbol,
    typeAlias,
  );

  const filterReqBody = await genRequestBody({
    type: filterPostType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/filter",
    method: "post",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });

  assert(filterReqBody !== null, "Filter RequestBody should not be null");
  assert(
    filterReqBody.content && filterReqBody.content["application/json"],
    "Filter RequestBody must contain application/json",
  );
  const filterSchema =
    filterReqBody.content["application/json"].schema as OpenAPIV3.SchemaObject;
  assert(filterSchema.properties?.from, "Filter schema must contain from property");
  assert(filterSchema.properties?.to, "Filter schema must contain to property");
  assert(
    !Array.isArray(filterSchema.required) || filterSchema.required.length === 0,
    "Filter schema must not declare required properties",
  );
  assert.strictEqual(
    filterReqBody.required,
    false,
    "All-optional body must be marked required: false",
  );
  console.log("  ✓ Case 1b PASSED: All-optional body is emitted with required: false!\n");

  console.log("Checking Case 1c: nullable all-optional type fallback in OpenAPI 3.0/3.1...");
  const nullableAlias = sf.getTypeAliasOrThrow("TypeOnlyNullableRoute");
  const nullableOptions = {
    type: nullableAlias.getType(),
    typeChecker,
    contextNode: nullableAlias,
    method: "post",
  };
  const nullableV30 = await genRequestBody({
    ...nullableOptions,
    adapter: v30Adapter,
  });
  const nullableV31 = await genRequestBody({
    ...nullableOptions,
    adapter: v31Adapter,
  });
  assert.strictEqual(nullableV30?.required, false, "3.0 nullable body must be optional");
  const nullableV31Schema = nullableV31?.content["application/json"]
    .schema as OpenAPIV3.SchemaObject & { type?: unknown };
  assert(
    Array.isArray(nullableV31Schema.type) &&
      nullableV31Schema.type.includes("object") &&
      nullableV31Schema.type.includes("null"),
    "3.1 fixture must exercise type: [object, null]",
  );
  assert.strictEqual(nullableV31?.required, false, "3.1 nullable body must be optional");
  console.log("  ✓ Case 1c PASSED: Nullable all-optional bodies stay optional in 3.0/3.1!\n");

  console.log("Checking Case 1d: primitive JSON body remains required...");
  const primitiveAlias = sf.getTypeAliasOrThrow("TypeOnlyPrimitiveRoute");
  const primitiveBody = await genRequestBody({
    type: primitiveAlias.getType(),
    typeChecker,
    contextNode: primitiveAlias,
    method: "post",
    adapter: v30Adapter,
  });
  assert.strictEqual(primitiveBody?.required, true, "Primitive body must be required");
  console.log("  ✓ Case 1d PASSED: Primitive bodies remain required!\n");

  console.log("Checking Case 1e: all-optional multipart form body...");
  const formAlias = sf.getTypeAliasOrThrow("TypeOnlyFormRoute");
  const formBody = await genRequestBody({
    type: formAlias.getType(),
    typeChecker,
    contextNode: formAlias,
    method: "post",
    adapter: v30Adapter,
  });
  assert(formBody?.content["multipart/form-data"], "Form media type must be emitted");
  assert.strictEqual(formBody.required, false, "All-optional form body must be optional");
  console.log("  ✓ Case 1e PASSED: All-optional form bodies are optional!\n");

  console.log("Checking Case 1f: unknown JSON schema remains conservatively required...");
  const unknownAlias = sf.getTypeAliasOrThrow("TypeOnlyUnknownRoute");
  const unknownBody = await genRequestBody({
    type: unknownAlias.getType(),
    typeChecker,
    contextNode: unknownAlias,
    method: "post",
    adapter: v30Adapter,
  });
  assert.strictEqual(unknownBody?.required, true, "Unknown body schema must remain required");
  console.log("  ✓ Case 1f PASSED: Unknown schemas retain required behavior!\n");

  console.log("Checking Case 1g: all-default Zod object body...");
  const defaultsRouteType = appType.getPropertyOrThrow("/api/filter-defaults");
  const defaultsPostSymbol = typeChecker
    .getTypeOfSymbolAtLocation(defaultsRouteType, typeAlias)
    .getPropertyOrThrow("$post");
  const defaultsPostType = typeChecker.getTypeOfSymbolAtLocation(
    defaultsPostSymbol,
    typeAlias,
  );
  const defaultsBody = await genRequestBody({
    type: defaultsPostType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/filter-defaults",
    method: "post",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });
  const defaultsSchema = defaultsBody?.content["application/json"]
    .schema as OpenAPIV3.SchemaObject;
  assert(
    defaultsSchema.properties?.sort && defaultsSchema.properties?.limit,
    "Defaulted properties must remain in the emitted schema",
  );
  assert.strictEqual(defaultsBody?.required, false, "All-default body must be optional");
  console.log("  ✓ Case 1g PASSED: Defaulted Zod properties are omittable!\n");

  console.log("Checking Case 1h: default plus genuinely required property...");
  const mixedRouteType = appType.getPropertyOrThrow("/api/filter-mixed");
  const mixedPostSymbol = typeChecker
    .getTypeOfSymbolAtLocation(mixedRouteType, typeAlias)
    .getPropertyOrThrow("$post");
  const mixedPostType = typeChecker.getTypeOfSymbolAtLocation(
    mixedPostSymbol,
    typeAlias,
  );
  const mixedBody = await genRequestBody({
    type: mixedPostType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/filter-mixed",
    method: "post",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });
  assert.strictEqual(
    mixedBody?.required,
    true,
    "A defaulted key must not hide another required key",
  );
  console.log("  ✓ Case 1h PASSED: Non-defaulted required keys keep the body required!\n");

  console.log("Checking Case 2: GET /api/search with collapsed input: {}...");
  const searchRouteType = appType.getPropertyOrThrow("/api/search");
  const searchGetSymbol = typeChecker
    .getTypeOfSymbolAtLocation(searchRouteType, typeAlias)
    .getPropertyOrThrow("$get");
  const searchGetType = typeChecker.getTypeOfSymbolAtLocation(
    searchGetSymbol,
    typeAlias,
  );

  const params = await genParameters({
    type: searchGetType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/search",
    method: "get",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });

  assert(params.length > 0, "Parameters should not be empty despite collapsed input");
  const qParam = params.find((p) => p.name === "q");
  assert(qParam, "Query parameter 'q' should be extracted");
  assert.strictEqual(qParam.in, "query");
  console.log("  ✓ Case 2 PASSED: Collapsed input fallback rescued query parameters from AST!\n");

  console.log("Checking Case 3: GET /api/ping with no input and no validator...");
  const pingRouteType = appType.getPropertyOrThrow("/api/ping");
  const pingGetSymbol = typeChecker
    .getTypeOfSymbolAtLocation(pingRouteType, typeAlias)
    .getPropertyOrThrow("$get");
  const pingGetType = typeChecker.getTypeOfSymbolAtLocation(
    pingGetSymbol,
    typeAlias,
  );

  const pingReqBody = await genRequestBody({
    type: pingGetType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/ping",
    method: "get",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });
  assert.strictEqual(pingReqBody, null, "Ping route must return null request body");

  const pingParams = await genParameters({
    type: pingGetType,
    typeChecker,
    contextNode: typeAlias,
    routePath: "/api/ping",
    method: "get",
    project,
    rootPath: tmpDir,
    adapter: v30Adapter,
  });
  assert.strictEqual(pingParams.length, 0, "Ping route must return empty parameters");
  console.log("  ✓ Case 3 PASSED: Unvalidated routes cleanly produce null / empty schemas!\n");

  console.log("🎉 ALL FALLBACK TESTS PASSED WITH 100% SUCCESS!");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
