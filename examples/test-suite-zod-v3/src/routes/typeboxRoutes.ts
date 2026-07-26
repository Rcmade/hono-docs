import { Hono } from "hono";
import { Type } from "@sinclair/typebox";
import { tbValidator } from "@hono/typebox-validator";

const typeboxSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  email: Type.String({ format: "email" }),
  age: Type.Number({ minimum: 18, maximum: 99 }),
});

export const typeboxRoutes = new Hono()
  .post("/tb-create", tbValidator("json", typeboxSchema), (c) => {
    return c.json({ success: true, data: c.req.valid("json") });
  });
