import { Hono } from "hono";
import { level3 } from "./level3";

export const level2 = new Hono()
  /**
   * Deep Level 2 Health
   * Checks the health at level 2.
   */
  .get("/health", (c) => {
    return c.text("Level 2 is healthy");
  })
  .route("/level3", level3);
