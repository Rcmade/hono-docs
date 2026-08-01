import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// Case 1: Exported Variable
export const exportedSchema = z.object({
  exportedField: z.string().min(5).max(50).default("default-exported"),
});

// Case 2: Local Non-Exported Variable
const localSchema = z.object({
  localField: z.string().min(10).max(100).default("default-local"),
});

// Routes testing all 3 cases
export const schemaTestCaseRoutes = new Hono()
  .post("/case-exported", zValidator("json", exportedSchema), (c) => {
    return c.json({ success: true, data: c.req.valid("json") });
  })
  .post("/case-local", zValidator("json", localSchema), (c) => {
    return c.json({ success: true, data: c.req.valid("json") });
  })
  .post(
    "/case-inline",
    zValidator(
      "json",
      z.object({
        inlineField: z.string().min(15).max(150).default("default-inline"),
      })
    ),
    (c) => {
      return c.json({ success: true, data: c.req.valid("json") });
    }
  );
