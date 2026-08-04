import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as v from "valibot";
import { vValidator } from "@hono/valibot-validator";
import { Type } from "@sinclair/typebox";
import { tbValidator } from "@hono/typebox-validator";

// 1. Zod Schemas
const zodJsonSchema = z.object({ title: z.string(), count: z.number().int() });
const zodQuerySchema = z.object({ limit: z.string().optional(), sort: z.enum(["asc", "desc"]).optional() });
const zodParamSchema = z.object({ id: z.string().uuid() });
const zodFormSchema = z.object({ fileUrl: z.string().url(), notes: z.string().max(500) });

// 2. Valibot Schemas
const valibotJsonSchema = v.object({ username: v.string(), age: v.number() });
const valibotQuerySchema = v.object({ filter: v.optional(v.string()), page: v.optional(v.string()) });
const valibotParamSchema = v.object({ code: v.pipe(v.string(), v.minLength(3), v.maxLength(10)) });

// 3. TypeBox Schemas
const typeboxJsonSchema = Type.Object({ sku: Type.String(), price: Type.Number({ minimum: 0 }) });
const typeboxQuerySchema = Type.Object({ active: Type.Optional(Type.String()) });
const typeboxParamSchema = Type.Object({ ref: Type.String({ minLength: 4 }) });

export const multiValidatorRoutes = new Hono()
  // 1-10: Zod validator routes
  .post("/zod-item/json", zValidator("json", zodJsonSchema), (c) => c.json({ success: true, data: c.req.valid("json") }))
  .get("/zod-item/query", zValidator("query", zodQuerySchema), (c) => c.json({ items: [] }))
  .get("/zod-item/:id/param", zValidator("param", zodParamSchema), (c) => c.json({ id: c.req.valid("param").id }))
  .post("/zod-item/form", zValidator("form", zodFormSchema), (c) => c.json({ uploaded: true }))
  .put("/zod-item/update", zValidator("json", zodJsonSchema), zValidator("query", zodQuerySchema), (c) => c.json({ updated: true }))
  .delete("/zod-item/:id", zValidator("param", zodParamSchema), (c) => c.json({ deleted: true }))
  .patch("/zod-item/:id/patch", zValidator("param", zodParamSchema), zValidator("json", zodJsonSchema), (c) => c.json({ patched: true }))
  .post("/zod-item/bulk", zValidator("json", z.array(zodJsonSchema)), (c) => c.json({ bulk: true }))
  .get("/zod-item/:id/verify", zValidator("param", zodParamSchema), (c) => c.json({ verified: true }))
  .post("/zod-item/clone", zValidator("json", z.object({ sourceId: z.string(), targetName: z.string() })), (c) => c.json({ cloned: true }))

  // 11-20: Valibot validator routes
  .post("/valibot-item/json", vValidator("json", valibotJsonSchema), (c) => c.json({ ok: true }))
  .get("/valibot-item/query", vValidator("query", valibotQuerySchema), (c) => c.json({ list: [] }))
  .get("/valibot-item/code/:code", vValidator("param", valibotParamSchema), (c) => c.json({ code: c.req.valid("param").code }))
  .put("/valibot-item/update", vValidator("json", valibotJsonSchema), (c) => c.json({ modified: true }))
  .delete("/valibot-item/remove/:code", vValidator("param", valibotParamSchema), (c) => c.json({ removed: true }))
  .patch("/valibot-item/sync", vValidator("json", v.object({ synced: v.boolean() })), (c) => c.json({ ok: true }))
  .post("/valibot-item/import", vValidator("json", v.array(valibotJsonSchema)), (c) => c.json({ count: 10 }))
  .get("/valibot-item/search", vValidator("query", v.object({ q: v.string() })), (c) => c.json({ found: 0 }))
  .post("/valibot-item/export", vValidator("json", v.object({ format: v.string() })), (c) => c.json({ file: "out.csv" }))
  .get("/valibot-item/status/:code", vValidator("param", valibotParamSchema), (c) => c.json({ status: "ready" }))

  // 21-30: TypeBox validator routes
  .post("/typebox-item/json", tbValidator("json", typeboxJsonSchema), (c) => c.json({ res: "created" }))
  .get("/typebox-item/query", tbValidator("query", typeboxQuerySchema), (c) => c.json({ results: [] }))
  .get("/typebox-item/ref/:ref", tbValidator("param", typeboxParamSchema), (c) => c.json({ ref: c.req.valid("param").ref }))
  .put("/typebox-item/edit", tbValidator("json", typeboxJsonSchema), (c) => c.json({ res: "edited" }))
  .delete("/typebox-item/drop/:ref", tbValidator("param", typeboxParamSchema), (c) => c.json({ res: "dropped" }))
  .patch("/typebox-item/flag", tbValidator("json", Type.Object({ flag: Type.Boolean() })), (c) => c.json({ res: "flagged" }))
  .post("/typebox-item/batch", tbValidator("json", Type.Array(typeboxJsonSchema)), (c) => c.json({ res: "batched" }))
  .get("/typebox-item/find", tbValidator("query", Type.Object({ keyword: Type.String() })), (c) => c.json({ hits: 5 }))
  .post("/typebox-item/generate", tbValidator("json", Type.Object({ template: Type.String() })), (c) => c.json({ generated: true }))
  .get("/typebox-item/info/:ref", tbValidator("param", typeboxParamSchema), (c) => c.json({ info: "active" }));
