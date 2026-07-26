import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { trackingRoutes } from "./deep/trackingRoutes";

const createOrderSchema = z.object({
  productId: z.string().uuid().describe("ID of the product to order"),
  quantity: z.number().int().min(1).describe("Number of items"),
  shippingAddress: z.object({
    line1: z.string(),
    city: z.string(),
    countryCode: z.string().length(2),
    postalCode: z.string()
  }).describe("Destination address"),
});

export const orderRoutes = new Hono()
  /**
   * @summary Create Order
   * @description Places a new order for a product and triggers the fulfillment pipeline.
   * @tag Orders
   */
  .post("/", zValidator("json", createOrderSchema), (c) => {
    const data = c.req.valid("json");
    return c.json({
      success: true,
      orderId: "ord_987654321",
      status: "PROCESSING",
      estimatedShippingDate: "2026-06-30T00:00:00Z"
    }, 201);
  })

  // Deeply nested tracking routes under orders
  .route("/tracking", trackingRoutes);
