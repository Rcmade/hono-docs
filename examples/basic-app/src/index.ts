import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { authRoutes } from "./routes/authRoutes";
import { productRoutes } from "./routes/productRoutes";
import { orderRoutes } from "./routes/orderRoutes";
import { docs } from "./routes/docs";

const app = new Hono()
  .basePath("/api")
  .get("/", (c) => {
    return c.json({ status: "Acme Corp API Online", version: "1.0.0" });
  })
  .route("/auth", authRoutes)
  .route("/products", productRoutes)
  .route("/orders", orderRoutes)
  .route("/docs", docs);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

export type AppType = typeof app;
