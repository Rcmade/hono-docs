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
)

/**
 * @summary Test Record AST Fallback
 * @description Returns a Record<string, number> to test AST index signature parsing
 */
.get(
  "/ast/record",
  (c) => {
    const data: Record<string, number> = { "foo": 1, "bar": 2 };
    return c.json(data, 200);
  }
)

/**
 * @summary Test Intersection AST Fallback
 * @description Returns an intersection type (A & B) to test AST allOf parsing
 */
.get(
  "/ast/intersection",
  (c) => {
    type A = { id: string };
    type B = { active: boolean };
    const data: A & B = { id: "123", active: true };
    return c.json(data, 200);
  }
)

/**
 * @summary Test Any AST Fallback
 * @description Returns an any type to ensure the generator doesn't crash
 */
.get(
  "/ast/any",
  (c) => {
    const data: any = { whatever: true, deep: { nest: 1 } };
    return c.json(data, 200);
  }
)

/**
 * @summary Test Record<string, any> AST Fallback
 * @description Returns a Record<string, any>
 */
.get(
  "/ast/record-any",
  (c) => {
    const data: Record<string, any> = { "foo": 1, "bar": "string" };
    return c.json(data, 200);
  }
)

/**
 * @summary Test Complex Nested Record
 * @description Returns a deeply nested Record with unions
 */
.get(
  "/ast/complex-record",
  (c) => {
    type NestedType = {
      id: string;
      metadata: Record<string, number | boolean>;
      tags: Array<string | null>;
    };
    const data: Record<string, NestedType> = {
      "user1": { id: "u1", metadata: { score: 100, active: true }, tags: ["vip", null] }
    };
    return c.json(data, 200);
  }
)

/**
 * @summary Test AST Union Fallback
 * @description Returns a union of literal strings and objects
 */
.get(
  "/ast/union",
  (c) => {
    type StatusResponse = 
      | "success"
      | "pending"
      | { error: string; code: number }
      | null;
      
    const data = "success" as StatusResponse;
    return c.json(data, 200);
  }
);

export const exhaustiveRoutes = app;
