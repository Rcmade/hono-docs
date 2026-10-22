import { Project } from "ts-morph";
import { extractJSDocs } from "../src/utils/jsdoc";
import * as assert from "node:assert";

async function runRouterTagTests() {
  console.log("🧪 Running Router Tags & Nested Router Tags Test Suite...\n");

  const project = new Project({ useInMemoryFileSystem: true });

  // ── Test Setup: Multi-File Project ──────────────────────────────────────────

  // File 1: Base auth router with JSDoc
  project.createSourceFile(
    "src/routes/auth.ts",
    `
    import { Hono } from "hono";

    /**
     * @tag Authentication
     * @description Endpoints for managing user sessions and credentials
     */
    export const authRoutes = new Hono()
      .post("/login", (c) => c.text("login"))
      .post("/register", (c) => c.text("register"));
  `,
  );

  // File 2: Tracking router (deeply nested)
  project.createSourceFile(
    "src/routes/deep/tracking.ts",
    `
    import { Hono } from "hono";

    /**
     * @tag Logistics
     * @description Real-time package tracking and fulfillment
     */
    export const trackingRoutes = new Hono()
      /**
       * @tag LiveGps
       */
      .get("/:trackingNumber", (c) => c.text("tracking"));
  `,
  );

  // File 3: Orders router (mounts tracking sub-router)
  project.createSourceFile(
    "src/routes/orders.ts",
    `
    import { Hono } from "hono";
    import { trackingRoutes } from "./deep/tracking";

    /**
     * @tag Orders
     * @description Customer order management
     */
    export const orderRoutes = new Hono()
      .post("/", (c) => c.text("create order"))
      /**
       * @tag Shipping
       */
      .route("/tracking", trackingRoutes);
  `,
  );

  // File 4: Barrel file re-exporting admin router
  project.createSourceFile(
    "src/routes/adminBase.ts",
    `
    import { Hono } from "hono";

    /**
     * @tag AdminPanel
     */
    export const adminBaseRouter = new Hono();
  `,
  );

  project.createSourceFile(
    "src/routes/index.ts",
    `
    export { adminBaseRouter } from "./adminBase";
  `,
  );

  // File 5: Mutating imported admin router in another file
  project.createSourceFile(
    "src/routes/adminDashboard.ts",
    `
    import { adminBaseRouter } from "./adminBase";

    adminBaseRouter.get("/dashboard", (c) => c.text("dash"));
  `,
  );

  // File 6: Deprecated and Ignored routers
  project.createSourceFile(
    "src/routes/legacy.ts",
    `
    import { Hono } from "hono";

    /**
     * @tag Legacy
     * @deprecated Use v2 APIs instead
     */
    export const legacyRoutes = new Hono()
      .get("/old", (c) => c.text("old"));

    /**
     * @ignore
     */
    export const hiddenRoutes = new Hono()
      .get("/secret-debug", (c) => c.text("debug"));
  `,
  );

  // File 7: Root App chaining all routers
  project.createSourceFile(
    "src/index.ts",
    `
    import { Hono } from "hono";
    import { authRoutes } from "./routes/auth";
    import { orderRoutes } from "./routes/orders";
    import { adminBaseRouter } from "./routes";
    import { legacyRoutes, hiddenRoutes } from "./routes/legacy";

    /**
     * @tag "User Management", Security
     */
    const subUserRouter = new Hono()
      .use("*", async (c, next) => next())
      .get("/profile", (c) => c.text("profile"));

    const app = new Hono()
      /**
       * @tag SecurityGateway
       */
      .route("/auth", authRoutes)
      .route("/orders", orderRoutes)
      .route("/admin", adminBaseRouter)
      .route("/users", subUserRouter)
      .route("/legacy", legacyRoutes)
      .route("/hidden", hiddenRoutes)
      .route("/orgs/:orgId/projects", new Hono()
        /**
         * @tag ProjectOrg
         */
        .get("/:projectId", (c) => c.text("proj"))
      );
  `,
  );

  const jsDocMap = extractJSDocs(project);

  // ── ASSERTION 1: Single router-level tag ────────────────────────────────────
  console.log("Checking Case 1: Router-level tag on authRoutes...");
  const loginDocs = jsDocMap.get("post /auth/login");
  assert.ok(
    loginDocs && loginDocs.length > 0,
    "Expected JSDoc for /auth/login",
  );
  // Inherits mount tag SecurityGateway + router tag Authentication
  assert.deepStrictEqual(
    loginDocs[0].tags,
    ["SecurityGateway", "Authentication"],
    "Should inherit mount tag and router declaration tag in order",
  );
  console.log(
    "  ✓ Case 1 PASSED: Routes inherited router tags without per-route @tag",
  );

  // ── ASSERTION 2: Nested multi-tier tag inheritance ──────────────────────────
  console.log("\nChecking Case 2: Multi-tier nested router tag inheritance...");
  // /orders/tracking/:trackingNumber -> /orders/tracking/{trackingNumber}
  const trackDocs = jsDocMap.get("get /orders/tracking/{trackingNumber}");
  assert.ok(
    trackDocs && trackDocs.length > 0,
    "Expected JSDoc for /orders/tracking/{trackingNumber}",
  );
  // Expected tags: parent (Orders) -> mount (Shipping) -> child (Logistics) -> route (LiveGps)
  assert.deepStrictEqual(
    trackDocs[0].tags,
    ["Orders", "Shipping", "Logistics", "LiveGps"],
    "Should inherit all tags across 3 router levels and route-level tag",
  );
  console.log(
    "  ✓ Case 2 PASSED: 3-tier router nesting inherited tags in order",
  );

  // ── ASSERTION 3: Cross-file router extension & barrel re-export ────────────
  console.log(
    "\nChecking Case 3: Cross-file router extension through barrel...",
  );
  const dashDocs = jsDocMap.get("get /admin/dashboard");
  assert.ok(
    dashDocs && dashDocs.length > 0,
    "Expected JSDoc for /admin/dashboard",
  );
  assert.deepStrictEqual(
    dashDocs[0].tags,
    ["AdminPanel"],
    "Should resolve router symbol across files and barrel re-exports",
  );
  console.log("  ✓ Case 3 PASSED: Cross-file mutation resolved through barrel");

  // ── ASSERTION 4: Quoted tags & multiple tags per line ───────────────────────
  console.log(
    "\nChecking Case 4: Quoted tags, comma-separated tags, and middleware .use()...",
  );
  const userDocs = jsDocMap.get("get /users/profile");
  assert.ok(
    userDocs && userDocs.length > 0,
    "Expected JSDoc for /users/profile",
  );
  assert.deepStrictEqual(
    userDocs[0].tags,
    ["User Management", "Security"],
    "Should parse quoted and comma-separated tags cleanly through .use() calls",
  );
  console.log(
    "  ✓ Case 4 PASSED: Quoted tags and .use() middleware traversal worked",
  );

  // ── ASSERTION 5: Router-level @deprecated propagation ──────────────────────
  console.log("\nChecking Case 5: Router-level @deprecated propagation...");
  const oldDocs = jsDocMap.get("get /legacy/old");
  assert.ok(oldDocs && oldDocs.length > 0, "Expected JSDoc for /legacy/old");
  assert.strictEqual(
    Boolean(oldDocs[0].deprecated),
    true,
    "Route inside deprecated router must inherit deprecated: true",
  );
  console.log("  ✓ Case 5 PASSED: Deprecated flag propagated to routes");

  // ── ASSERTION 6: Router-level @ignore / @exclude ───────────────────────────
  console.log(
    "\nChecking Case 6: Router-level @ignore / @exclude propagation...",
  );
  const hiddenDocs = jsDocMap.get("get /hidden/secret-debug");
  assert.ok(
    hiddenDocs && hiddenDocs.length > 0,
    "Expected JSDoc entry for hidden route",
  );
  assert.strictEqual(
    hiddenDocs[0].exclude,
    true,
    "Route inside @ignore router must be marked exclude: true",
  );
  console.log(
    "  ✓ Case 6 PASSED: Router-level @ignore excluded all enclosed routes",
  );

  // ── ASSERTION 7: Parameterized mount prefix ────────────────────────────────
  console.log(
    "\nChecking Case 7: Parameterized mount prefix (:orgId -> {orgId})...",
  );
  const projDocs = jsDocMap.get("get /orgs/{orgId}/projects/{projectId}");
  assert.ok(
    projDocs && projDocs.length > 0,
    "Expected JSDoc for parameterized route /orgs/{orgId}/projects/{projectId}",
  );
  assert.deepStrictEqual(projDocs[0].tags, ["ProjectOrg"]);
  console.log(
    "  ✓ Case 7 PASSED: Parameterized mount prefixes normalized to OpenAPI format",
  );

  // ── ASSERTION 8: Tag metadata (descriptions) ───────────────────────────────
  console.log("\nChecking Case 8: Tag descriptions in tagMetadata...");
  assert.strictEqual(
    jsDocMap.tagMetadata.get("Authentication"),
    "Endpoints for managing user sessions and credentials",
  );
  assert.strictEqual(
    jsDocMap.tagMetadata.get("Logistics"),
    "Real-time package tracking and fulfillment",
  );
  assert.strictEqual(
    jsDocMap.tagMetadata.get("Orders"),
    "Customer order management",
  );
  console.log(
    "  ✓ Case 8 PASSED: Tag descriptions correctly captured in tagMetadata",
  );

  // ── ASSERTION 9: Factory function router generation ────────────────────────
  console.log("\nChecking Case 9: Factory function router generation...");
  const factoryProject = new Project({ useInMemoryFileSystem: true });
  factoryProject.createSourceFile(
    "src/factory.ts",
    `
    import { Hono } from "hono";
    function createCrud(name: string) {
      return new Hono().get("/items", (c) => c.text("items"));
    }
    const app = new Hono()
      /**
       * @tag UserModule
       */
      .route("/users", createCrud("users"))
      /**
       * @tag ProductModule
       */
      .route("/products", createCrud("products"));
  `,
  );
  const factoryMap = extractJSDocs(factoryProject);
  const userItems = factoryMap.get("get /users/items");
  const prodItems = factoryMap.get("get /products/items");
  assert.ok(userItems, "Expected /users/items route");
  assert.ok(prodItems, "Expected /products/items route");
  assert.deepStrictEqual(userItems[0].tags, ["UserModule"]);
  assert.deepStrictEqual(prodItems[0].tags, ["ProductModule"]);
  console.log(
    "  ✓ Case 9 PASSED: Factory function routes inherited mount tags",
  );

  // ── ASSERTION 10: Object property router ───────────────────────────────────
  console.log("\nChecking Case 10: Object property router...");
  const objProject = new Project({ useInMemoryFileSystem: true });
  objProject.createSourceFile(
    "src/obj.ts",
    `
    import { Hono } from "hono";
    const routers = {
      /**
       * @tag PropAuth
       * @description Property authentication
       */
      auth: new Hono().post("/prop-login", (c) => c.text("ok")),
    };
    const app = new Hono().route("/prop", routers.auth);
  `,
  );
  const objMap = extractJSDocs(objProject);
  const propLogin = objMap.get("post /prop/prop-login");
  assert.ok(propLogin, "Expected /prop/prop-login route");
  assert.deepStrictEqual(propLogin[0].tags, ["PropAuth"]);
  assert.strictEqual(
    objMap.tagMetadata.get("PropAuth"),
    "Property authentication",
  );
  console.log(
    "  ✓ Case 10 PASSED: Object property router tags and descriptions extracted",
  );

  // ── ASSERTION 11: Single router mounted multiple times with different tags ──
  console.log(
    "\nChecking Case 11: Shared router mounted at multiple prefixes with different tags...",
  );
  const multiMountProject = new Project({ useInMemoryFileSystem: true });
  multiMountProject.createSourceFile(
    "src/multimount.ts",
    `
    import { Hono } from "hono";
    const sharedRouter = new Hono().get("/ping", (c) => c.text("pong"));
    const app = new Hono()
      /**
       * @tag PublicAPI
       */
      .route("/public", sharedRouter)
      /**
       * @tag InternalAPI
       */
      .route("/internal", sharedRouter);
  `,
  );
  const multiMountMap = extractJSDocs(multiMountProject);
  const pubPing = multiMountMap.get("get /public/ping");
  const intPing = multiMountMap.get("get /internal/ping");
  assert.ok(pubPing, "Expected /public/ping route");
  assert.ok(intPing, "Expected /internal/ping route");
  assert.deepStrictEqual(pubPing[0].tags, ["PublicAPI"]);
  assert.deepStrictEqual(intPing[0].tags, ["InternalAPI"]);
  console.log(
    "  ✓ Case 11 PASSED: Path-aware tagging preserved distinct tags across mounts",
  );

  // ── ASSERTION 12: External handler function with JSDoc ─────────────────────
  console.log("\nChecking Case 12: External handler function with JSDoc...");
  const handlerProject = new Project({ useInMemoryFileSystem: true });
  handlerProject.createSourceFile(
    "src/handlers/userHandler.ts",
    `
    /**
     * @summary Retrieve profile data
     * @tag ProfileHandlerTag
     */
    export async function getProfile(c: { text: (t: string) => string }) {
      return c.text("profile");
    }
  `,
  );
  handlerProject.createSourceFile(
    "src/routes/userRoutes.ts",
    `
    import { Hono } from "hono";
    import { getProfile } from "../handlers/userHandler";

    /**
     * @tag UserRouter
     */
    export const userRoutes = new Hono()
      .get("/profile", getProfile);
  `,
  );
  const handlerMap = extractJSDocs(handlerProject);
  const profileDocs = handlerMap.get("get /profile");
  assert.ok(profileDocs, "Expected /profile route");
  assert.deepStrictEqual(profileDocs[0].tags, [
    "UserRouter",
    "ProfileHandlerTag",
  ]);
  assert.strictEqual(profileDocs[0].summary, "Retrieve profile data");
  console.log(
    "  ✓ Case 12 PASSED: External handler function JSDoc merged cleanly",
  );

  // ── ASSERTION 13: Regex path parameters ({[0-9]+}) normalized accurately ──
  console.log("\nChecking Case 13: Regex path parameter normalization...");
  const regexProject = new Project({ useInMemoryFileSystem: true });
  regexProject.createSourceFile(
    "src/routes/archive.ts",
    `
    import { Hono } from "hono";

    /**
     * @tag History
     */
    export const archiveRoutes = new Hono()
      /**
       * @summary Archive By Year and Month
       * @description Historical records query
       * @tag ArchiveTag
       */
      .get("/archive/:year{[0-9]{4}}/:month{[0-9]{2}}", (c) => c.text("archive"));
  `,
  );
  const regexMap = extractJSDocs(regexProject);
  const archiveDocs = regexMap.get("get /archive/{year}/{month}");
  assert.ok(
    archiveDocs && archiveDocs.length > 0,
    "Expected JSDoc for /archive/{year}/{month}",
  );
  assert.deepStrictEqual(archiveDocs[0].tags, ["History", "ArchiveTag"]);
  assert.strictEqual(archiveDocs[0].summary, "Archive By Year and Month");
  assert.strictEqual(archiveDocs[0].description, "Historical records query");
  console.log(
    "  ✓ Case 13 PASSED: Regex path parameters normalized cleanly to OpenAPI template",
  );

  // ── ASSERTION 14: Variable reassignment unwrap and description with commas ──
  console.log(
    "\nChecking Case 14: Variable reassignment and tag description with commas...",
  );
  const reassignmentProject = new Project({ useInMemoryFileSystem: true });
  reassignmentProject.createSourceFile(
    "src/routes/sub.ts",
    `
    import { Hono } from "hono";
    export const subRoute = new Hono().get("/list", (c) => c.text("list"));
  `,
  );
  reassignmentProject.createSourceFile(
    "src/routes/projects.ts",
    `
    import { Hono } from "hono";
    import { subRoute } from "./sub";
    const app = new Hono().route("/", subRoute);
    export const projectRoutes = app;
  `,
  );
  reassignmentProject.createSourceFile(
    "src/app.ts",
    `
    import { Hono } from "hono";
    import { projectRoutes } from "./routes/projects";
    export const app = new Hono()
      /**
       * @tag Secrets - Secret variables, matrix, and bulk operations
       */
      .route("/projects", projectRoutes);
  `,
  );
  const reassignMap = extractJSDocs(reassignmentProject);
  const listDocs = reassignMap.get("get /projects/list");
  assert.ok(
    listDocs && listDocs.length > 0,
    "Expected JSDoc for /projects/list through variable reassignment",
  );
  assert.deepStrictEqual(listDocs[0].tags, ["Secrets"]);
  assert.strictEqual(
    reassignMap.tagMetadata.get("Secrets"),
    "Secret variables, matrix, and bulk operations",
  );
  console.log(
    "  ✓ Case 14 PASSED: Variable reassignment unwrapped and commas preserved in tag descriptions",
  );

  console.log("\n🎉 ALL 14 INTEGRATION TESTS PASSED WITH 100% SUCCESS!");
}

runRouterTagTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
