import { Hono } from "hono";
import { level4 } from "./level4";

export const level3 = new Hono()
  /**
   * @summary Deep Level 3 Info
   * @description Passing through level 3.
   */
  .get("/info", (c) => {
    return c.json({ level: 3 });
  })
  .route("/level4", level4);
