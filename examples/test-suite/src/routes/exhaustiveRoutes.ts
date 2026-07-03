import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  exhaustiveCookieSchema,
  exhaustiveFormSchema,
  exhaustiveHeaderSchema,
  exhaustiveJsonSchema,
  exhaustivePathSchema,
  exhaustiveQuerySchema,
} from "../schemas/exhaustiveSchemas";
type ComplexResponse = {
  // Primitives & Nullables
  id: string;
  description: string | null;
  isActive: boolean;
  score: number | undefined;

  // Enums & Literals
  status: "active" | "archived" | "deleted";
  permissions: Array<"read" | "write" | "admin">;

  // Intersections
  auditInfo: { createdBy: string } & { createdAt: Date };

  // Arrays & Tuples
  metrics: number[];
  coordinates: [number, number, string];

  // Records / Dictionaries
  customData: Record<string, string | null>;

  // Nested Arrays of Objects
  history: Array<{
    action: string;
    timestamp: Date;
    previousState: Record<string, unknown> | null;
  }>;
};

const app = new Hono()

/**
 * @summary Full Exhaustive Test
 * @description Validates cookies, headers, path, query, json body, and highly complex TS response types.
 * @tag Exhaustive Validation
 */
  .post(
  "/full/:userId/docs/:documentId",
  zValidator("cookie", exhaustiveCookieSchema),
  zValidator("header", exhaustiveHeaderSchema),
  zValidator("query", exhaustiveQuerySchema),
  zValidator("param", exhaustivePathSchema),
  zValidator("json", exhaustiveJsonSchema),
  (c) => {
    return c.json<ComplexResponse>({} as any, 201);
  }
)

/**
 * @summary Multipart Form Test
 * @description Validates multipart/form-data schemas and error unions.
 * @tag Exhaustive Validation
 */
  .post(
  "/form",
  zValidator("form", exhaustiveFormSchema),
  (c) => {
    // Return different statuses natively
    if (Math.random() > 0.5) {
      return c.json({ error: "File too large", code: 413 }, 413);
    }
    return c.json({ success: true, uploadedAt: new Date() }, 200);
  }
)

/**
 * @summary Hidden Route
 * @description This route should not appear in the OpenAPI docs at all.
 * @ignore
 */
  .post(
  "/hidden",
  (c) => {
    return c.json({ status: "hidden" }, 200);
  }
);

export const exhaustiveRoutes = app;
