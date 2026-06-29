import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const trackingRoutes = new Hono()
  /**
   * @summary Get Shipment Tracking
   * @description Fetches real-time GPS tracking data for a specific shipment.
   * @tag Logistics
   */
  .get("/:trackingNumber", zValidator("param", z.object({ trackingNumber: z.string() })), (c) => {
    const { trackingNumber } = c.req.valid("param");
    return c.json({
      trackingNumber,
      status: "IN_TRANSIT",
      location: { lat: 40.7128, lng: -74.0060 },
      estimatedDelivery: "2026-07-01T12:00:00Z"
    });
  });
