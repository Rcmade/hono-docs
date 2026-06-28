import { Hono } from "hono";

export const nestedRoutes = new Hono()
  /**
   * @summary Nested Get
   * @description A nested route in a separate file.
   */
  .get("/info", (c) => c.json({ info: true }));
