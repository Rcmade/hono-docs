# @rcmade/hono-docs

> Automatically generate production-grade OpenAPI 3.0 specifications directly from your Hono application's TypeScript type definitions — no decorators, no manual schemas.

[![npm version](https://img.shields.io/npm/v/@rcmade/hono-docs)](https://www.npmjs.com/package/@rcmade/hono-docs)
[![license](https://img.shields.io/github/license/rcmade/hono-docs)](https://github.com/Rcmade/hono-docs/blob/main/LICENSE)

---

## How It Works

`hono-docs` uses **ts-morph** to statically analyze your Hono `AppType` at build time. It traverses your TypeScript types — including deeply nested `.route()` compositions — extracts Zod validation schemas, path/query/header parameters, request bodies, and JSDoc comments, then emits a fully merged `openapi.json` file. Zero runtime overhead.

---

## Features

| Feature | Description |
|---|---|
| 🔀 **Nested Routing** | Fully supports complex apps composed with `.route()` and `.basePath()`. Point to your single root `AppType` and every sub-route is auto-discovered. |
| 📝 **JSDoc Extraction** | Write `@summary`, `@description`, and `@tag` in comments above your routes. The engine automatically maps them to the correct nested path in the spec. |
| ✅ **Zod Schema Inference** | Extracts full Zod validation schemas (including nested objects, optional fields, unions, arrays) for request bodies and responses — no extra config needed. |
| 🗂️ **Path Parameters** | Automatically generates `in: path` parameters from Hono path patterns like `/:id`. |
| 🔍 **Query Parameters** | Extracts `in: query` parameters with correct `required` flags from your Zod validators. |
| 📦 **Request Body** | Generates `requestBody` with `application/json` and `multipart/form-data` content types automatically. |
| 🔢 **HTTP Status Codes** | Resolves exact HTTP status codes (e.g. `201`, `404`) from your route return types, not just generic `default`. |
| 🏷️ **Tag Grouping** | Routes are automatically grouped by tags from JSDoc comments for clean, navigable documentation. |
| 🌐 **Cross-Platform** | Works on Windows, macOS, and Linux. Uses `jiti` for config loading with full `pathToFileURL` support. |
| 🚀 **Zero Runtime Overhead** | All analysis is done at build time. Nothing is injected into your production bundle. |
| ⚙️ **TypeScript & JS Configs** | Config files can be `.ts` or `.js` with full `defineConfig` type inference. |
| 🔗 **Monorepo Ready** | Works seamlessly in `pnpm`/`npm`/`yarn` workspaces and monorepo setups. |

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
      apiPrefix: "/api",
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

export const authRoutes = new Hono()
  .post(
    "/login",
    zValidator("json", z.object({ email: z.string().email(), password: z.string().min(8) })),
    (c) => c.json({ token: "..." })
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
  .post(
    "/login",
    zValidator("json", loginSchema),
    (c) => c.json({ token: "..." })
  );
```

Supported JSDoc tags:

| Tag | Description |
|---|---|
| `@summary` | Short one-line title shown in the docs UI |
| `@description` | Longer markdown-friendly description for the endpoint |
| `@tag` | Groups the endpoint under a named tag in the sidebar |

### 4. Add an npm Script

```jsonc
// package.json
{
  "scripts": {
    "docs": "npx @rcmade/hono-docs generate --config ./hono-docs.ts"
  }
}
```

### 5. Run the Generator

```bash
npm run docs
```

Output:

```text
Initializing ts-morph with tsConfig: ./tsconfig.json
✅ Wrote: output/types/.d.ts
✅ OpenAPI written to output/openapi/.json
✅ Final merged OpenAPI spec written to: ./openapi/openapi.json
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
  .route("/auth", authRoutes)        // → /api/auth/*
  .route("/products", productRoutes) // → /api/products/*
  .route("/orders", orderRoutes)     // → /api/orders/*
  .route("/docs", docs);             // → /api/docs/*

// ✅ A single root AppType captures your entire API surface
export type AppType = typeof app;
```

The generator will produce accurate OpenAPI paths for every route at every nesting level, including deeply composed routers like `/api/orders/tracking/:trackingNumber`.

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

export type AppType = typeof docs;
export default docs;
```

Visit `/api/docs` for the interactive UI and `/api/docs/open-api` for the raw JSON spec.

---

## Configuration Reference

All options live in your `defineConfig({ ... })` call:

| Field | Type | Required | Description |
|---|---|---|---|
| `tsConfigPath` | `string` | ✅ | Path to your project's `tsconfig.json` |
| `openApi` | `OpenAPIConfig` | ✅ | Static OpenAPI document fields |
| └ `openapi` | `string` | ✅ | OpenAPI version string (e.g. `"3.0.0"`) |
| └ `info` | `{ title, version, description? }` | ✅ | API title, version, and optional description |
| └ `servers` | `Array<{ url, description? }>` | ✅ | Server base URL(s) |
| `outputs` | `{ openApiJson: string }` | ✅ | Output file paths |
| └ `openApiJson` | `string` | ✅ | Where to write the merged `openapi.json` |
| `apis` | `ApiGroup[]` | ✅ | Route groups to document |
| └ `name` | `string` | ✅ | Human-readable name for this group |
| └ `apiPrefix` | `string` | ✅ | URL prefix prepended to all paths in this group |
| └ `appTypePath` | `string` | ✅ | Path to the file exporting `AppType` |
| └ `api` | `Api[]` | — | Optional explicit endpoint overrides (see below) |
| &nbsp;&nbsp;└ `api` | `string` | ✅ | Endpoint path without prefix, e.g. `/user/{id}` |
| &nbsp;&nbsp;└ `method` | `"get" \| "post" \| "put" \| "patch" \| "delete"` | ✅ | HTTP method |
| &nbsp;&nbsp;└ `summary` | `string` | — | Short summary shown in docs |
| &nbsp;&nbsp;└ `description` | `string` | — | Longer endpoint description |
| &nbsp;&nbsp;└ `tag` | `string[]` | — | Tags for grouping in the sidebar |
| `preDefineTypeContent` | `string` | — | Content injected at the top of generated `.d.ts` snapshots |

---

## CLI Usage

```text
Usage: hono-docs generate --config <path>

Options:
  -c, --config   Path to your hono-docs config file (.ts or .js)   [required]
  -h, --help     Show help
```

---

## Programmatic Usage

```ts
import { runGenerate } from "@rcmade/hono-docs";

await runGenerate("./hono-docs.ts");
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
