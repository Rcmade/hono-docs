import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// 1. Circular Zod Type definition
interface Category {
  name: string;
  subcategories: Category[];
}
const categorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    name: z.string(),
    subcategories: z.array(categorySchema),
  }),
);

// 2. Mutually Recursive Zod Type definition
interface NodeA {
  name: string;
  nodeB?: NodeB;
}
interface NodeB {
  value: number;
  nodeA?: NodeA;
}
const nodeASchema: z.ZodType<NodeA> = z.lazy(() =>
  z.object({
    name: z.string(),
    nodeB: z.lazy(() => nodeBSchema).optional(),
  }),
);
const nodeBSchema: z.ZodType<NodeB> = z.lazy(() =>
  z.object({
    value: z.number(),
    nodeA: nodeASchema.optional(),
  }),
);

export const testRoutes = new Hono()
  /**
   * @summary Test Circular Schema Generation
   * @description Test endpoint to check self-referencing circular structure handling.
   * @tag Circular Testing
   */
  .post("/circular-test", zValidator("json", categorySchema), (c) => {
    const data = c.req.valid("json");
    return c.json({ success: true, data });
  })

  /**
   * @summary Test Mutually Recursive Schema Generation
   * @description Test endpoint to check mutually recursive structures handling.
   * @tag Circular Testing
   */
  .post("/mutual-circular-test", zValidator("json", nodeASchema), (c) => {
    const data = c.req.valid("json");
    return c.json({ success: true, data });
  })

  /**
   * @summary Test Various Parameters
   * @description Test endpoint to check query, headers, cookies, path parameters, and Date type formatting.
   * @tag Parameter Testing
   */
  .post(
    "/complex-test/:id",
    zValidator("param", z.object({ id: z.string() })),
    zValidator("query", z.object({ page: z.string(), search: z.string().optional() })),
    zValidator("header", z.object({ "x-api-key": z.string() })),
    zValidator("cookie", z.object({ token: z.string() })),
    (c) => {
      return c.json({ success: true, timestamp: new Date() });
    },
  )

  /**
   * @summary Test Union Type Simplifications
   * @description Test endpoint to check boolean union simplifies to boolean, and nullable fields resolve to nullable.
   * @tag Union Testing
   */
  .post(
    "/union-test",
    zValidator(
      "json",
      z.object({
        isActive: z.boolean().nullable().describe("A nullable boolean"),
        role: z.union([z.literal("admin"), z.literal("user"), z.null()]).describe("A nullable string enum"),
      }),
    ),
    (c) => {
      const data = c.req.valid("json");
      return c.json({ success: true, data });
    },
  );
