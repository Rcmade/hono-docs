import { Hono } from "hono";
import { level2 } from "./level2";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const level1 = new Hono()
  /**
   * @summary Level 1 Ping
   * @description Ping endpoint for level 1.
   * @tag Deep
   */
  .post("/ping", zValidator("json", z.object({ msg: z.string() })), (c) => {
    return c.json({ pong: c.req.valid("json").msg });
  })
  .route("/level2", level2);
