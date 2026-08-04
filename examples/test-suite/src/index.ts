import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { authRoutes } from "./routes/authRoutes";
import { productRoutes } from "./routes/productRoutes";
import { orderRoutes } from "./routes/orderRoutes";
import { testRoutes } from "./routes/testRoutes";
import { complexRoutes } from "./routes/complexRoutes";
import { zodRoutes } from "./routes/zodRoutes";
import { valibotRoutes } from "./routes/valibotRoutes";
import { typeboxRoutes } from "./routes/typeboxRoutes";
import { enterpriseBillingRoutes } from "./routes/enterpriseBillingRoutes";
import { exhaustiveRoutes } from "./routes/exhaustiveRoutes";
import { docs } from "./routes/docs";
import { cacheStressRoutes } from "./routes/cacheStressRoutes";
import { multiValidatorRoutes } from "./routes/multiValidatorRoutes";
import { edgeCaseRoutes } from "./routes/edgeCaseRoutes";

const app1 = new Hono()
  .basePath("/api")
  .get("/", (c) => {
    return c.json({ status: "Acme Corp API Online", version: "1.0.0" });
  })
  .route("/auth", authRoutes)
  .route("/products", productRoutes)
  .route("/orders", orderRoutes)
  .route("/tests", testRoutes)
  .route("/complex", complexRoutes);

const app = app1
  .route("/zod", zodRoutes)
  .route("/valibot", valibotRoutes)
  .route("/typebox", typeboxRoutes)
  .route("/enterprise", enterpriseBillingRoutes);

const app2 = app
  .route("/exhaustive", exhaustiveRoutes)
  .route("/docs", docs)
  .route("/stress", cacheStressRoutes)
  .route("/multi", multiValidatorRoutes)
  .route("/edge", edgeCaseRoutes);


serve(
  {
    fetch: app2.fetch,
    port: 3002,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

export type AppType = typeof app2;
