# @rcmade/hono-docs

> Automatically generate production-grade OpenAPI 3.0 specifications directly from your Hono application's TypeScript type definitions — no decorators, no manual schemas.

[![npm version](https://img.shields.io/npm/v/@rcmade/hono-docs)](https://www.npmjs.com/package/@rcmade/hono-docs)
[![license](https://img.shields.io/github/license/rcmade/hono-docs)](https://github.com/Rcmade/hono-docs/blob/main/LICENSE)

---

## How It Works

`hono-docs` uses **ts-morph** to statically analyze your Hono `AppType` at build time. It traverses your TypeScript types — including deeply nested `.route()` compositions — extracts validation schemas (Zod, Valibot, TypeBox), path/query/header/cookie parameters, request bodies, and JSDoc comments, then emits a fully merged `openapi.json` file. Zero runtime overhead.

---

## Features

| Feature                               | Description                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔀 **Nested Routing**                 | Fully supports complex apps composed with `.route()` and `.basePath()`. Point to your single root `AppType` and every sub-route is auto-discovered.                                                                                            |
| ⚡ **Incremental Caching**            | Automatically caches route definitions and validator schemas between builds. Unchanged endpoints and schemas are served from cache without regenerating.                                                                                       |
| 👁️ **Watch Mode**                     | Run `--watch` (or `-w`) to automatically rebuild docs on every file save. Uses a persistent ts-morph project and debounced AST hot-reloading for near-instant incremental updates.                                                             |
| 🔁 **Schema Deduplication**           | Repeated inline schemas are automatically extracted into `components/schemas` and replaced with `$ref` pointers. Named schemas (via `x-schema-name`) are always promoted; anonymous schemas are promoted when they appear more than once.      |
| 📝 **JSDoc Extraction**               | Write `@summary`, `@description`, `@tag`, and `@ignore` in comments above your routes. The engine automatically maps them to the correct nested path in the spec, even across multiple mount prefixes.                                         |
| ✅ **Multi-Library Schema Inference** | Extracts full validation schemas for request bodies and responses from **Zod (v3 & v4), Valibot, Arktype, and TypeBox**. Automatically detects the library and uses runtime resolution for highest accuracy. Supports `oneOf` response unions. |
| 🗂️ **Path Parameters**                | Automatically generates `in: path` parameters from Hono path patterns like `/:id`.                                                                                                                                                             |
| 🔍 **Input Parameters**               | Extracts `query`, `header`, and `cookie` parameters with correct `required` flags from your validators.                                                                                                                                        |
| 📦 **Request Body**                   | Generates `requestBody` with `application/json` and `multipart/form-data` content types automatically.                                                                                                                                         |
| 🔢 **HTTP Status Codes**              | Resolves exact HTTP status codes (e.g. `201`, `404`) from your route return types, not just generic `default`. Supports all methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, `ALL`.                                        |
| 🏷️ **Tag Grouping**                   | Routes are automatically grouped by tags from JSDoc comments for clean, navigable documentation.                                                                                                                                               |
| 🧹 **Auto-Clean**                     | Automatically omits completely excluded or empty routes from the final spec.                                                                                                                                                                   |
| 🌐 **Cross-Platform**                 | Works on Windows, macOS, and Linux. Uses `jiti` for config loading with full `pathToFileURL` support.                                                                                                                                          |
| 🚀 **Zero Runtime Overhead**          | All analysis is done at build time. Nothing is injected into your production bundle.                                                                                                                                                           |
| ⚙️ **TypeScript & JS Configs**        | Config files can be `.ts` or `.js` with full `defineConfig` type inference.                                                                                                                                                                    |
| 🔗 **Monorepo Ready**                 | Works seamlessly in `pnpm`/`npm`/`yarn` workspaces and monorepo setups.                                                                                                                                                                        |

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Install](#install)
- [Quick Start](#quick-start)
  - [1. Create a Config File](#1-create-a-config-file)
  - [2. Define Your Routes](#2-define-your-routes)
  - [3. Add JSDoc Comments](#3-add-jsdoc-comments)
  - [4. Add an npm Script](#4-add-an-npm-script)
  - [5. Run the Generator](#5-run-the-generator)
- [Nested Routing (Grouped AppType)](#nested-routing-grouped-apptype)
- [Incremental Caching](#incremental-caching)
- [Watch Mode](#watch-mode)
- [Schema Deduplication](#schema-deduplication)
- [Serving the OpenAPI Docs](#serving-the-openapi-docs)
- [Configuration Reference](#configuration-reference)
- [CLI Usage](#cli-usage)
- [Programmatic Usage](#programmatic-usage)
- [Examples](#examples)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Install

```bash
# npm
npm install --save-dev @rcmade/hono-docs

# pnpm
pnpm add -D @rcmade/hono-docs

# yarn
yarn add -D @rcmade/hono-docs
```

---

## Quick Start

### 1. Create a Config File

Create `hono-docs.ts` at the root of your project:

```ts
import { defineConfig } from "@rcmade/hono-docs";

export default defineConfig({
  tsConfigPath: "./tsconfig.json",
  openApi: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
      description: "Automatically generated from Hono route types.",
    },
    servers: [{ url: "http://localhost:3000", description: "Development" }],
  },
  outputs: {
    openApiJson: "./openapi/openapi.json",
  },
  apis: [
    {
      name: "My App",
      apiPrefix: "",
      appTypePath: "src/index.ts", // Path to the file exporting your AppType
    },
  ],
});
```

### 2. Define Your Routes

Export your Hono app instance type as `AppType` from your entry file:

```ts
// src/index.ts
import { Hono } from "hono";
import { authRoutes } from "./routes/authRoutes";
import { productRoutes } from "./routes/productRoutes";

const app = new Hono()
  .basePath("/api")
  .route("/auth", authRoutes)
  .route("/products", productRoutes);

// Required: export your app type so hono-docs can analyze it
export type AppType = typeof app;
export default app;
```

```ts
// src/routes/authRoutes.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const authRoutes = new Hono().post(
  "/login",
  zValidator(
    "json",
    z.object({ email: z.string().email(), password: z.string().min(8) }),
  ),
  (c) => c.json({ token: "..." }),
);
```

### 3. Add JSDoc Comments

Annotate your routes with JSDoc to enrich your OpenAPI spec with summaries, descriptions, and tags. The engine automatically maps comments to the correct final route paths, even across nested routers:

```ts
export const authRoutes = new Hono()
  /**
   * @summary Authenticate User
   * @description Validates credentials and returns a signed JWT session token.
   * @tag Authentication
   */
  .post("/login", zValidator("json", loginSchema), (c) =>
    c.json({ token: "..." }),
  );
```

Supported JSDoc tags:

| Tag               | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `@summary`        | Short one-line title shown in the docs UI                                      |
| `@description`    | Longer markdown-friendly description for the endpoint                          |
| `@tag`            | Groups the endpoint under a named tag in the sidebar                           |
| `@deprecated`     | Marks the endpoint as deprecated in the generated spec                         |
| `@response`       | Custom response description: `@response <status> <desc>`                       |
| `@example`        | Adds a JSON example: `@example {"foo": "bar"}`                                 |
| `@responseHeader` | Documents a response header: `@responseHeader <status> <name> [<type>] <desc>` |
| `@ignore`         | (or `@exclude`, `@hide`) Completely omits the endpoint from the generated docs |

Example with a response header:

```ts
import { Hono } from "hono";

export const userRoutes = new Hono()
  /**
   * @summary List users
   * @description Returns a paginated user directory.
   * @tag Users
   * @responseHeader 200 X-Total-Count [integer] Total number of users
   */
  .get("/users", (c) => {
    c.header("X-Total-Count", "100");
    return c.json({ users: [] });
  });
```

### 4. Add an npm Script

```jsonc
// package.json
{
  "scripts": {
    "docs": "npx @rcmade/hono-docs generate --config ./hono-docs.ts",
  },
}
```

### 5. Run the Generator

```bash
npm run docs
```

```text
  ◆  hono-docs v1.3.0  ·  ./hono-docs.ts  ·  ./tsconfig.json

  🔍  Analyzing routes...
      GET     /api                                          →  no input
      POST    /api/auth/login                               →  zod json
      GET     /api/products/:productId                      →  ts type param
      POST    /api/test-cases/case-inline                   →  ts type json
      POST    /api/enterprise/orgs/:…ces/:invoiceId/adjust  →  valibot query · param  typebox header  zod json

  📊  Documentation Summary

      Endpoints Discovered  :  5 total  ( GET: 2 · POST: 3 )
      JSDoc Coverage        :  3 / 5 routes documented (60%)

  ⚙️  Schema Resolution Engine

      zod       ████████████░░░░░░░░  3 routes  (Dynamic)
      valibot   ████░░░░░░░░░░░░░░░  1 route   (Dynamic)
      typebox   ████░░░░░░░░░░░░░░░  1 route   (Dynamic)
      ts type   ████████░░░░░░░░░░░░  2 routes  (Static AST)
      no input  ████████░░░░░░░░░░░░  2 routes  (No validation required)

  📄  Output written

      ./openapi/openapi.json  132.5 KB

  ✨  Done in 355ms
```

---

## Nested Routing (Grouped AppType)

`hono-docs` fully supports complex Hono applications composed with multiple `.route()` and `.basePath()` calls. You don't need to create a separate `AppType` for each route file — just point to your **single root `AppType`** and the engine handles everything automatically.

```ts
// src/index.ts
import { Hono } from "hono";
import { authRoutes } from "./routes/authRoutes";
import { productRoutes } from "./routes/productRoutes";
import { orderRoutes } from "./routes/orderRoutes";
import docs from "./routes/docs";

const app = new Hono()
  .basePath("/api")
  .get("/", (c) => c.json({ status: "ok" }))
  .route("/auth", authRoutes) // → /api/auth/*
  .route("/products", productRoutes) // → /api/products/*
  .route("/orders", orderRoutes) // → /api/orders/*
  .route("/docs", docs); // → /api/docs/*

// ✅ A single root AppType captures your entire API surface
export type AppType = typeof app;
```

The generator will produce accurate OpenAPI paths for every route at every nesting level, including deeply composed routers like `/api/orders/tracking/:trackingNumber`.

### ⚠️ Important: TypeScript Chaining Limits

When building large applications, chaining too many `.route()` calls on a single `Hono` instance (usually around 8-10 chains) will exceed TypeScript's internal instantiation depth limit. When this happens, TypeScript gives up and infers an empty `BlankSchema` for your app, causing `hono-docs` to see zero routes.

To fix this, simply break your route chain into intermediate variables to reset TypeScript's depth counter:

```ts
// Calculate first batch of routes
const app1 = new Hono()
  .route("/auth", authRoutes)
  .route("/products", productRoutes)
  .route("/orders", orderRoutes)
  .route("/tests", testRoutes);

// Start a new chain using the locked-in type
const app = app1.route("/complex", complexRoutes).route("/docs", docs);
```

---

## Incremental Caching

`hono-docs` automatically caches results between builds — unchanged routes and schemas are skipped on subsequent runs with no extra config required.

To disable caching and force a full rebuild (e.g. in CI/CD), pass `--no-cache`:

```bash
npx @rcmade/hono-docs generate --config ./hono-docs.ts --no-cache

# Or via npm script
npm run docs -- --no-cache
```

---

## Watch Mode

`hono-docs` includes a built-in file watcher for development workflows. Pass `--watch` (or `-w`) to the `generate` command and docs will automatically rebuild every time you save a source file.

```bash
# Via CLI
npx @rcmade/hono-docs generate --config ./hono-docs.ts --watch

# Combine with --no-cache for a forced rebuild on every change
npx @rcmade/hono-docs generate --config ./hono-docs.ts --watch --no-cache
```

Or add a dedicated script to your `package.json`:

```jsonc
{
  "scripts": {
    "docs": "npx @rcmade/hono-docs generate --config ./hono-docs.ts",
    "docs:watch": "npx @rcmade/hono-docs generate --config ./hono-docs.ts --watch",
  },
}
```

Watch mode rebuilds your docs instantly on every file save — no manual re-runs needed. Rapid saves are batched automatically, so only one build fires per logical change. Press `Ctrl+C` to stop.

---

## Schema Deduplication

`hono-docs` automatically cleans up the generated spec so you get a leaner, more readable OpenAPI document with no extra config:

- Repeated schemas are extracted into `components/schemas` and replaced with `$ref` pointers — no more copy-pasted inline shapes across every endpoint.
- Named schemas (from Zod, Valibot, TypeBox, or source-level type names) are always promoted with their original name.
- `$defs` / `definitions` blocks from validator libraries are hoisted to `components/schemas` and rewritten as standard `$ref` links.

Deduplication runs automatically after generation — no configuration is required.

---

## Serving the OpenAPI Docs

We recommend **Scalar** for a beautiful, interactive API reference UI.

**Install:**

```bash
npm install @scalar/hono-api-reference
```

**Create a docs route:**

```ts
// src/routes/docs.ts
import { Hono } from "hono";
import { apiReference } from "@scalar/hono-api-reference";
import fs from "node:fs/promises";
import path from "node:path";

const docs = new Hono()
  .get(
    "/",
    apiReference({
      url: "/api/docs/open-api",
      theme: "kepler",
      layout: "modern",
    }),
  )
  .get("/open-api", async (c) => {
    const raw = await fs.readFile(
      path.join(process.cwd(), "./openapi/openapi.json"),
      "utf-8",
    );
    return c.json(JSON.parse(raw));
  });

export type DocsType = typeof docs;
export default docs;
```

Mount this under your main app (for example `.route("/docs", docs)`). Keep pointing `appTypePath` at your **root** app’s `AppType`, not this docs module.

Visit `/api/docs` for the interactive UI and `/api/docs/open-api` for the raw JSON spec.

---

## Configuration Reference

All options live in your `defineConfig({ ... })` call:

| Field                       | Type                                                                              | Required | Description                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tsConfigPath`              | `string`                                                                          | ✅       | Path to your project's `tsconfig.json`                                                                                              |
| `openApiVersion`            | `"3.0" \| "3.1"`                                                                  | —        | The OpenAPI version adapter to use (defaults to "3.0")                                                                              |
| `openApi`                   | `OpenAPIConfig`                                                                   | ✅       | Static OpenAPI document fields                                                                                                      |
| └ `openapi`                 | `string`                                                                          | ✅       | OpenAPI version string (e.g. `"3.0.0"`)                                                                                             |
| └ `info`                    | `{ title, version, description? }`                                                | ✅       | API title, version, and optional description                                                                                        |
| └ `servers`                 | `Array<{ url, description? }>`                                                    | ✅       | Server base URL(s)                                                                                                                  |
| `outputs`                   | `{ openApiJson?: string, openApiYaml?: string }`                                  | ✅       | Output file paths (at least one is required)                                                                                        |
| └ `openApiJson`             | `string`                                                                          | —        | Where to write the merged `openapi.json`                                                                                            |
| └ `openApiYaml`             | `string`                                                                          | —        | Where to write the merged `openapi.yaml`                                                                                            |
| `apis`                      | `ApiGroup[]`                                                                      | ✅       | Route groups to document                                                                                                            |
| └ `name`                    | `string`                                                                          | ✅       | Human-readable name for this group                                                                                                  |
| └ `apiPrefix`               | `string`                                                                          | ✅       | Extra URL prefix prepended at merge time. Use `""` when `AppType` already includes the full path (typical with `.basePath()`).      |
| └ `appTypePath`             | `string`                                                                          | ✅       | Path to the file exporting `AppType`                                                                                                |
| └ `api`                     | `Api[]`                                                                           | —        | Optional explicit endpoint overrides (see below)                                                                                    |
| &nbsp;&nbsp;└ `api`         | `string`                                                                          | ✅       | Endpoint path without prefix, e.g. `/user/{id}`                                                                                     |
| &nbsp;&nbsp;└ `method`      | `"get" \| "post" \| "put" \| "patch" \| "delete" \| "options" \| "head" \| "all"` | ✅       | HTTP method                                                                                                                         |
| &nbsp;&nbsp;└ `summary`     | `string`                                                                          | —        | Short summary shown in docs                                                                                                         |
| &nbsp;&nbsp;└ `description` | `string`                                                                          | —        | Longer endpoint description                                                                                                         |
| &nbsp;&nbsp;└ `tag`         | `string[]`                                                                        | —        | Tags for grouping in the sidebar                                                                                                    |
| `preDefineTypeContent`      | `string`                                                                          | —        | Content injected at the top of generated `.d.ts` snapshots (e.g. `import { Env } from './types';`) to resolve missing global types. |

---

## CLI Usage

```text
Usage: hono-docs <command> [options]

Commands:
  hono-docs generate  Generate OpenAPI JSON/YAML
  hono-docs validate  Validate that the generated OpenAPI spec matches the source code without writing to disk

Options:
  -c, --config     Path to your hono-docs config file (.ts or .js)   [required]
      --no-cache   Bypass the incremental cache and force full regeneration
  -w, --watch      Watch for file changes and seamlessly rebuild
  -h, --help       Show help
```

---

## Programmatic Usage

```ts
import { runGenerate, runWatch } from "@rcmade/hono-docs";

// Standard run (uses incremental caching automatically)
await runGenerate("./hono-docs.ts");

// Force clean regeneration (bypass cache)
await runGenerate("./hono-docs.ts", { noCache: true });

// Start watch mode (blocks until process is killed)
await runWatch("./hono-docs.ts");

// Watch mode with cache disabled
await runWatch("./hono-docs.ts", { noCache: true });
```

---

## Examples

See [`examples/basic-app/`](https://github.com/rcmade/hono-docs/tree/main/examples/basic-app) for a complete working example featuring:

- Modular nested route architecture (`auth`, `products`, `orders`, `tracking`)
- Zod validation on request bodies and query parameters
- JSDoc annotations for summaries, descriptions, and tags
- Scalar API reference UI served from the app itself

---

## Development

```bash
# Clone and install
git clone https://github.com/rcmade/hono-docs.git
cd hono-docs
pnpm install

# Build the library
pnpm build

# Watch mode during development
pnpm build --watch

# Link locally to test in another project
pnpm link --global
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes with a clear message
4. Open a pull request with a description of what changed and why
5. Ensure linting passes (`pnpm lint`)

---

## License

[MIT](https://github.com/Rcmade/hono-docs/blob/main/LICENSE)
