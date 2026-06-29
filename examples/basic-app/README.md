# Acme Corp E-Commerce API Example

This example demonstrates how to use `@rcmade/hono-docs` in a professional, real-world application structure. It models a backend for an E-Commerce platform, showcasing deep nested routing, custom JSDoc metadata extraction, and complex Zod validations.

## 🚀 Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Generate the OpenAPI Spec:**
   Run the CLI tool to automatically traverse the codebase and generate the OpenAPI JSON file.
   ```bash
   pnpm run docs
   ```
   This will output `openapi/openapi.json`.

3. **Start the Development Server:**
   Launch the Hono server to interact with the API and view the auto-generated documentation UI.
   ```bash
   pnpm run dev
   ```

4. **View the Docs:**
   Open your browser and navigate to:
   [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## 📁 Architecture Highlight

This example showcases how `@rcmade/hono-docs` elegantly handles deeply nested and modular routing:
- `src/index.ts` - Main entry point that exports the root `AppType`.
- `src/routes/authRoutes.ts` - Authentication & user provisioning.
- `src/routes/productRoutes.ts` - Catalog and inventory queries with complex pagination schemas.
- `src/routes/orderRoutes.ts` - Order pipelines. Demonstrates **nested routes** by importing and mounting `trackingRoutes.ts` underneath it.

Look closely at the source code to see how JSDoc tags (`@summary`, `@description`, and `@tag`) are used directly on Hono `.get()` / `.post()` handlers to natively power the OpenAPI output without maintaining duplicate configuration.
