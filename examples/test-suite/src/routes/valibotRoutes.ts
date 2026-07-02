import { Hono } from "hono";
import { vValidator } from "@hono/valibot-validator";
import { externalValibotSchema } from "../schemas/externalValibot";

export const valibotRoutes = new Hono()
  .post("/vb-create", vValidator("json", externalValibotSchema), (c) => {
    return c.json({ success: true, data: c.req.valid("json") });
  });
