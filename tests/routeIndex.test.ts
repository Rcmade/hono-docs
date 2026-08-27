import { Project } from "ts-morph";
import { getProjectRouteIndex, normalizeToHonoPath } from "../src/schema-resolver/routeIndex";
import * as assert from "assert";

async function runTests() {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("src/routes/authRoute/signinRoutes.ts", `
    import { Hono } from "hono";
    export const signInRoutes = new Hono().post("/", async (c) => {});
  `);
  project.createSourceFile("src/control/routes/clientsRoutes.ts", `
    import { Hono } from "hono";
    export const clientsRoutes = new Hono().post("/", async (c) => {});
  `);

  const index = getProjectRouteIndex(project);
  
  // Test 1: Fallback ranking - /api/auth/signin should match signinRoutes over clientsRoutes
  const signinMatch = index.locate("post", "/api/auth/signin");
  assert.ok(signinMatch, "Should find a match for /api/auth/signin");
  assert.strictEqual(signinMatch.sourceFilePath.includes("signinRoutes.ts"), true, "Should rank signinRoutes.ts highest");

  // Test 2: Fallback ranking - /control/v1/clients should match clientsRoutes over signinRoutes
  const clientsMatch = index.locate("post", "/control/v1/clients");
  assert.ok(clientsMatch, "Should find a match for /control/v1/clients");
  assert.strictEqual(clientsMatch.sourceFilePath.includes("clientsRoutes.ts"), true, "Should rank clientsRoutes.ts highest");
  
  console.log("All tests passed!");
}

runTests().catch(console.error);
