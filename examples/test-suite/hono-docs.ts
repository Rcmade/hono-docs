import { defineConfig } from "@rcmade/hono-docs";

export default defineConfig({
  tsConfigPath: "./tsconfig.json",
  openApi: {
    openapi: "3.0.0",
    info: {
      title: "API Test Suite",
      version: "1.0.0",
      description:
        "Sandbox and Integration Test Suite for all parameter types, circular references, and edge cases.",
    },
    servers: [
      { url: "http://localhost:3002", description: "Development Server" },
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
