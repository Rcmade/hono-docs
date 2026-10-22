# @rcmade/hono-docs

<p align="center">
  <strong>Generate production-grade OpenAPI (Swagger) specifications directly from your existing Hono TypeScript routes.</strong><br>
  No route rewrites. No custom router decorators. Zero runtime overhead.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rcmade/hono-docs"><img src="https://img.shields.io/npm/v/@rcmade/hono-docs.svg?style=flat-square&color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@rcmade/hono-docs"><img src="https://img.shields.io/npm/dm/@rcmade/hono-docs.svg?style=flat-square&color=success" alt="npm downloads" /></a>
  <a href="https://github.com/rcmade/hono-docs/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rcmade/hono-docs?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/TypeScript-Strict%20Types-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/OpenAPI-3.0%20%7C%203.1-brightgreen?style=flat-square" alt="OpenAPI 3.0 & 3.1" />
  <img src="https://img.shields.io/badge/Hono-v4%2B-orange?style=flat-square" alt="Hono v4+" />
</p>

---

## Why hono-docs?

Most OpenAPI solutions for Hono require rewriting routes with custom wrapper DSLs or running heavy schema parsers inside your production bundle. `hono-docs` statically inspects your Hono `AppType` at build time using `ts-morph` — generating accurate, production-grade OpenAPI specifications with zero route modifications and zero runtime footprint.

```
Existing Hono Routes  ──>  TypeScript AppType  ──>  [hono-docs build]  ──>  openapi.json & openapi.yaml
(No code changes!)          (Standard typeof app)   (Zero runtime cost)     (Scalar / Swagger UI)
```

- **Zero route rewrites** — works directly with standard `.get()`, `.post()`, and `.route()` code.
- **Zero runtime overhead** — static analysis runs entirely at build time; nothing is bundled into production.
- **Multi-validator support** — automatic schema extraction for **Zod (v3 & v4), Valibot, TypeBox, and ArkType**.
- **Deep nested routing** — traverses chained `.route()` and `.basePath()` mounts automatically.
- **Fast developer workflow** — incremental caching and instant watch mode (`-w`) for rapid iteration.

---

## 🔍 See It in Action

### 1. Your Existing Hono Route

Write standard Hono handlers with your favorite validator and standard JSDoc comments:

```ts
// src/routes/users.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "user"]).default("user"),
});

export const userRoutes = new Hono()
  /**
   * @summary Create a new user
   * @description Provisions a new user account and returns the generated profile.
   * @tag Users
   * @response 201 User created successfully
   */
  .post("/", zValidator("json", CreateUserSchema), async (c) => {
    const data = c.req.valid("json");
    return c.json({ id: "usr_123", ...data }, 201);
  });
```

### 2. The Generated OpenAPI Specification

Run `npx hono-docs generate` and get a clean, valid OpenAPI 3.0 / 3.1 document with deduplicated schemas:

```yaml
paths:
  /api/users:
    post:
      summary: Create a new user
      description: Provisions a new user account and returns the generated profile.
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateUserSchema"
      responses:
        "201":
          description: User created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string }
                  name: { type: string }
                  email: { type: string, format: email }
                  role: { type: string, enum: [admin, user] }
components:
  schemas:
    CreateUserSchema:
      type: object
      required: [name, email]
      properties:
        name: { type: string, minLength: 2 }
        email: { type: string, format: email }
        role: { type: string, enum: [admin, user], default: user }
```

---

## 🥊 Comparison with Alternatives

| Feature                             |         `@rcmade/hono-docs`         |      `@hono/zod-openapi`      |        `hono-openapi`        |
| :---------------------------------- | :---------------------------------: | :---------------------------: | :--------------------------: |
| **Requires Route Rewrites?**        | ❌ **No (Uses native Hono routes)** |    ⚠️ Yes (`createRoute`)     | ⚠️ Yes (Middleware wrappers) |
| **Zero Runtime Overhead**           |    ✅ **Yes (Pure build-time)**     |   ❌ No (Runtime footprint)   |  ❌ No (Runtime footprint)   |
| **Zod v3 & v4 Support**             |             ✅ **Yes**              |          ⚠️ Zod only          |         ⚠️ Zod only          |
| **Valibot, TypeBox & ArkType**      |        ✅ **All supported**         |             ❌ No             |            ❌ No             |
| **Nested Router Composition**       |    ✅ **Automatic (`.route()`)**    |       ⚠️ Complex setup        |   ⚠️ Manual configuration    |
| **Instant Watch Mode**              |  ✅ **Yes (`--watch` / hot AST)**   |             ❌ No             |            ❌ No             |
| **Incremental Build Cache**         |             ✅ **Yes**              |             ❌ No             |            ❌ No             |
| **Schema Deduplication (`$ref`)**   |          ✅ **Automatic**           | ⚠️ Manual `$ref` registration |          ⚠️ Manual           |
| **CI Drift Detection (`validate`)** |     ✅ **Built-in CLI command**     |             ❌ No             |            ❌ No             |

---

## 📦 Installation

> **Compatibility:** Hono v4+, Node.js 18+, TypeScript 5+. Works on Bun, Deno, Cloudflare Workers, and any TypeScript-first environment.

```bash
# npm
npm install --save-dev @rcmade/hono-docs

# pnpm
pnpm add -D @rcmade/hono-docs

# bun
bun add -d @rcmade/hono-docs

# yarn
yarn add -D @rcmade/hono-docs
```

---

## 🚀 Quick Start (60 Seconds)

### Step 1: Create `hono-docs.ts`

Create a configuration file at the root of your project:

```ts
// hono-docs.ts
import { defineConfig } from "@rcmade/hono-docs";

export default defineConfig({
  tsConfigPath: "./tsconfig.json",
  openApiVersion: "3.0", // or "3.1"
  openApi: {
    openapi: "3.0.0",
    info: {
      title: "My Hono API",
      version: "1.0.0",
      description: "Auto-generated OpenAPI specification from Hono AppType.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local Development" },
    ],
  },
  outputs: {
    openApiJson: "./openapi/openapi.json",
    openApiYaml: "./openapi/openapi.yaml", // optional
  },
  apis: [
    {
      name: "Main API",
      apiPrefix: "", // Prefix prepended to route paths (or empty if .basePath is used)
      appTypePath: "src/index.ts", // Path to the file exporting AppType
    },
  ],
});
```

### Step 2: Export Your `AppType`

In your main entry file, export the type of your Hono instance:

```ts
// src/index.ts
import { Hono } from "hono";
import { userRoutes } from "./routes/users";
import { productRoutes } from "./routes/products";

const app = new Hono()
  .basePath("/api")
  .route("/users", userRoutes)
  .route("/products", productRoutes);

// 🔑 Export your app's type definition:
export type AppType = typeof app;
export default app;
```

### Step 3: Run the Generator

Add a script to your `package.json`:

```json
{
  "scripts": {
    "docs": "hono-docs generate --config ./hono-docs.ts",
    "docs:watch": "hono-docs generate --config ./hono-docs.ts --watch",
    "docs:check": "hono-docs validate --config ./hono-docs.ts"
  }
}
```

Run the build:

```bash
npm run docs
```

```text
  ◆  hono-docs v1.4.0  ·  ./hono-docs.ts  ·  ./tsconfig.json

  🔍  Analyzing routes...
      POST    /api/users                                    →  zod json
      GET     /api/products/:productId                      →  path param
      POST    /api/orders/:orderId/checkout                 →  valibot body · header

  📊  Documentation Summary
      Endpoints Discovered  :  3 total
      JSDoc Coverage        :  3 / 3 routes documented (100%)

  📄  Outputs written
      ./openapi/openapi.json  42.1 KB
      ./openapi/openapi.yaml  28.4 KB

  ✨  Done in 240ms
```

---

## 🎨 Serving Your API Docs

Mount an interactive documentation UI directly from your Hono application:

### Option 1: [Scalar](https://github.com/scalar/scalar) (Recommended)

Scalar provides a beautiful, modern API reference UI with search, code generation, and live request testing.

```bash
npm install @scalar/hono-api-reference
```

```ts
// src/routes/docs.ts
import { Hono } from "hono";
import { apiReference } from "@scalar/hono-api-reference";
import fs from "node:fs/promises";
import path from "node:path";

const docs = new Hono()
  // Interactive UI at /api/docs
  .get(
    "/",
    apiReference({
      theme: "kepler",
      spec: { url: "/api/docs/openapi.json" },
    }),
  )
  // Raw OpenAPI JSON at /api/docs/openapi.json
  .get("/openapi.json", async (c) => {
    const spec = await fs.readFile(
      path.join(process.cwd(), "./openapi/openapi.json"),
      "utf-8",
    );
    return c.json(JSON.parse(spec));
  });

export default docs;
```

Mount this in your root app:

```ts
// src/index.ts
const app = new Hono()
  .basePath("/api")
  .route("/users", userRoutes)
  .route("/docs", docs); // → /api/docs (UI) and /api/docs/openapi.json
```

### Option 2: [Swagger UI](https://github.com/honojs/middleware/tree/main/packages/swagger-ui)

```bash
npm install @hono/swagger-ui
```

```ts
import { swaggerUI } from "@hono/swagger-ui";

const docs = new Hono()
  .get("/", swaggerUI({ url: "/api/docs/openapi.json" }))
  .get("/openapi.json", async (c) => {
    const spec = await fs.readFile(
      path.join(process.cwd(), "./openapi/openapi.json"),
      "utf-8",
    );
    return c.json(JSON.parse(spec));
  });
```

---

## 💡 Feature Guide

### 1. Multi-Library Validation Inference

`hono-docs` automatically detects and resolves validation schemas from all leading TypeScript validation libraries:

- **Zod (v3 & v4)**: `zValidator("json", ...)`
- **Valibot**: `@valibot/to-json-schema` integration
- **TypeBox**: `@sinclair/typebox` schema resolution
- **ArkType**: Fast syntax and runtime resolution
- **Static TypeScript AST Types**: Inferred types for parameters and responses when no validator is used

Supports `query`, `json`, `form`, `header`, `cookie`, and path parameter extraction.

### 2. JSDoc Annotations & Inheritance

Enrich endpoints cleanly without runtime code changes:

```ts
export const orderRoutes = new Hono()
  /**
   * @summary Retrieve order details
   * @description Fetches the full line items, delivery status, and invoice information.
   * @tag Orders
   * @deprecated
   * @responseHeader 200 X-Rate-Limit [integer] Remaining requests per minute
   * @example {"status": "shipped"}
   */
  .get("/:orderId", (c) => {
    /* ... */
  });
```

#### Available JSDoc Tags

| Tag                    | Purpose                                   | Example                                              |
| :--------------------- | :---------------------------------------- | :--------------------------------------------------- |
| `@summary`             | Short endpoint headline                   | `@summary Search users`                              |
| `@description`         | Long description (Markdown supported)     | `@description Filter users by creation date...`      |
| `@tag`                 | Groups endpoint in documentation sidebar  | `@tag Billing`                                       |
| `@deprecated`          | Marks route as deprecated in OpenAPI spec | `@deprecated`                                        |
| `@response`            | Custom status description                 | `@response 404 Item was not found`                   |
| `@responseHeader`      | Documents a response header               | `@responseHeader 200 X-Request-ID [string] Trace ID` |
| `@example`             | Inline JSON example payload               | `@example {"active": true}`                          |
| `@ignore` / `@exclude` | Hides endpoint from generated docs        | `@ignore Internal endpoint`                          |

#### Router-Level Tag Inheritance

Annotate router declarations or `.route()` mounts directly. All nested handlers automatically inherit parent tags:

```ts
/**
 * @tag Payments
 * @description Endpoints for Stripe and merchant transactions
 */
export const paymentRoutes = new Hono()
  .post("/charge", (c) => c.text("ok"))
  .post("/refund", (c) => c.text("ok"));
```

### 3. Deep Nested Route Composition

Compose complex APIs freely with `.route()` and `.basePath()`. `hono-docs` traverses the type tree to compute full URL paths:

```ts
const api = new Hono()
  .basePath("/api/v1")
  .route("/orgs/:orgId/teams", teamRoutes)
  .route("/orgs/:orgId/members", memberRoutes);

export type AppType = typeof api;
```

> **TypeScript Tip (Deep Chaining Limits):**  
> If your application chains more than 8–10 `.route()` calls on a single instance, TypeScript may hit its internal instantiation depth limit. To avoid this, split chains across intermediate variables:
>
> ```ts
> const subRoutes = new Hono()
>   .route("/auth", authRoutes)
>   .route("/users", userRoutes);
>
> const app = new Hono().route("/v1", subRoutes).route("/health", healthRoutes);
>
> export type AppType = typeof app;
> ```

### 4. Automatic Schema Deduplication (`$ref`)

`hono-docs` cleans up your specification automatically:

- Reusable schemas appearing across multiple endpoints are extracted into `components.schemas` and referenced with `$ref`.
- Named schemas (from type names or `x-schema-name`) retain their human-readable identifiers.
- Third-party `$defs` / `definitions` blocks are hoisted to the root level.

### 5. Incremental Caching & Watch Mode

- **Incremental Caching**: Only files modified since the last run are parsed. Fast builds even on large monorepos. (Bypass with `--no-cache`).
- **Live Watch Mode**: Run `hono-docs generate -w`. Uses an in-memory `ts-morph` project with debounced AST hot-reloading for near-instant rebuilds on save.

---

## 🛡️ CI/CD & Drift Detection

Prevent outdated documentation from reaching production by adding spec validation to your CI pipeline:

```bash
# Validates that generated specs match your current source code without writing to disk
npx @rcmade/hono-docs validate --config ./hono-docs.ts
```

### GitHub Actions Workflow

```yaml
# .github/workflows/verify-docs.yml
name: Verify API Documentation

on:
  pull_request:
    branches: [main]

jobs:
  validate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci
      - name: Verify OpenAPI spec is up-to-date
        run: npx @rcmade/hono-docs validate --config ./hono-docs.ts
```

---

## ⚙️ Configuration Reference

Options available in `defineConfig`:

| Option                 | Type                           | Required | Description                                              |
| :--------------------- | :----------------------------- | :------: | :------------------------------------------------------- |
| `tsConfigPath`         | `string`                       |    ✅    | Path to project `tsconfig.json`.                         |
| `openApiVersion`       | `"3.0" \| "3.1"`               |    —     | OpenAPI version adapter (defaults to `"3.0"`).           |
| `openApi`              | `OpenAPIConfig`                |    ✅    | Base metadata (`info`, `servers`, `externalDocs`).       |
| `openApi.info.title`   | `string`                       |    ✅    | API title.                                               |
| `openApi.info.version` | `string`                       |    ✅    | API version string.                                      |
| `openApi.servers`      | `Array<{ url, description? }>` |    ✅    | Target server environments.                              |
| `outputs.openApiJson`  | `string`                       |    —     | Target path for output `openapi.json`.                   |
| `outputs.openApiYaml`  | `string`                       |    —     | Target path for output `openapi.yaml`.                   |
| `apis`                 | `ApiGroup[]`                   |    ✅    | List of API entry points to analyze.                     |
| `apis[].name`          | `string`                       |    ✅    | Descriptive name for the route group.                    |
| `apis[].appTypePath`   | `string`                       |    ✅    | Source file exporting the `AppType`.                     |
| `apis[].apiPrefix`     | `string`                       |    —     | Global URL prefix prepended to routes.                   |
| `apis[].api`           | `ApiOverride[]`                |    —     | Manual route overrides if needed.                        |
| `preDefineTypeContent` | `string`                       |    —     | Custom TypeScript declarations injected before analysis. |

---

## 💻 CLI & Programmatic API

### CLI Commands

```bash
# Generate OpenAPI spec files
hono-docs generate -c ./hono-docs.ts

# Watch mode for development
hono-docs generate -c ./hono-docs.ts --watch

# Clean build bypassing cache
hono-docs generate -c ./hono-docs.ts --no-cache

# Validate spec in CI/CD without modifying disk
hono-docs validate -c ./hono-docs.ts
```

### Programmatic API

```ts
import { runGenerate, runWatch } from "@rcmade/hono-docs";

// Run build programmatically
await runGenerate("./hono-docs.ts", { noCache: false });

// Start file watcher
await runWatch("./hono-docs.ts");
```

---

## 📁 Examples

A complete reference application is included in the repository:

**[`examples/basic-app/`](https://github.com/rcmade/hono-docs/tree/main/examples/basic-app)**
- Modular route architecture with `auth`, `products`, `orders`, and `tracking` route groups
- Zod-validated request bodies and query parameters
- JSDoc annotations for summaries, tags, and response descriptions
- Scalar interactive UI served directly from the Hono app
- Working `hono-docs.ts` config you can copy directly into your project

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the [repository](https://github.com/rcmade/hono-docs).
2. Create your feature branch (`git checkout -b feat/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Ensure linting and tests pass (`pnpm lint`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/rcmade/hono-docs/blob/main/LICENSE) for more information.

---

## 💬 Community & Support

- **Bug reports & questions** → [Open an issue](https://github.com/rcmade/hono-docs/issues)
- **Ideas & roadmap** → [Start a discussion](https://github.com/rcmade/hono-docs/discussions)
- **npm package** → [npmjs.com/package/@rcmade/hono-docs](https://www.npmjs.com/package/@rcmade/hono-docs)

If `hono-docs` saves you time, a ⭐ on [GitHub](https://github.com/rcmade/hono-docs) helps other Hono developers discover it.

<p align="center">Built with ❤️ for the <a href="https://hono.dev">Hono</a> community.</p>
