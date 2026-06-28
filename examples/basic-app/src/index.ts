import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { userRoutes } from "./routes/userRoutes";
import docs from "./routes/docs";

import { level1 } from "./routes/deep/level1";

const app = new Hono()
  .basePath("/api")
  .get("/", (c) => {
    return c.text("Hello Hono!");
  })
  .route("/docs", docs)
  .route("/user", userRoutes)
  .route("/deep", level1);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);

export type AppType = typeof app;
