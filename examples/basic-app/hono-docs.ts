import { defineConfig } from "@rcmade/hono-docs";

export default defineConfig({
  tsConfigPath: "./tsconfig.json",
  openApi: {
    openapi: "3.0.0",
    info: {
      title: "Acme Corp E-Commerce API",
      version: "2.0.0",
      description:
        "Official API for managing users, product catalogs, and order fulfillment pipelines.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Development Server" },
    ],
  },
  outputs: {
    openApiJson: "./openapi/openapi.json",
  },
  apis: [
    {
      name: "E-Commerce Platform",
      apiPrefix: "",
      appTypePath: "src/index.ts", // Uses the root Hono AppType containing all grouped routes
    },
  ],
});
