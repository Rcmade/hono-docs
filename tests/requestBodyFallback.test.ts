import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Project } from "ts-morph";
import { genRequestBody } from "../src/utils/requestBody";
import { genParameters } from "../src/utils/parameters";
import { v30Adapter } from "../src/openapi/adapters/v3-0";
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

    const app = new Hono()
      .post("/api/auth/login", zValidator("json", loginSchema), (c) => c.json({ ok: true }))
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
  console.log("  ✓ Case 1 PASSED: Collapsed input fallback rescued JSON body schema from AST!\n");

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
