import { Hono } from "hono";
import { z } from "zod";
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
    },
  )

  /**
   * @summary Multipart Form Test
   * @description Validates multipart/form-data schemas and error unions.
   * @tag Exhaustive Validation
   */
  .post("/form", zValidator("form", exhaustiveFormSchema), (c) => {
    // Return different statuses natively
    if (Math.random() > 0.5) {
      return c.json({ error: "File too large", code: 413 }, 413);
    }
    return c.json({ success: true, uploadedAt: new Date() }, 200);
  })

  /**
   * @summary Hidden Route
   * @description This route should not appear in the OpenAPI docs at all.
   * @ignore
   */
  .post("/hidden", (c) => {
    return c.json({ status: "hidden" }, 200);
  })

  /**
   * @summary Test Record AST Fallback
   * @description Returns a Record<string, number> to test AST index signature parsing
   */
  .get("/ast/record", (c) => {
    const data: Record<string, number> = { foo: 1, bar: 2 };
    return c.json(data, 200);
  })

  /**
   * @summary Test Intersection AST Fallback
   * @description Returns an intersection type (A & B) to test AST allOf parsing
   */
  .get("/ast/intersection", (c) => {
    type A = { id: string };
    type B = { active: boolean };
    const data: A & B = { id: "123", active: true };
    return c.json(data, 200);
  })

  /**
   * @summary Test Any AST Fallback
   * @description Returns an any type to ensure the generator doesn't crash
   */
  .get("/ast/any", (c) => {
    const data: any = { whatever: true, deep: { nest: 1 } };
    return c.json(data, 200);
  })

  /**
   * @summary Test Record<string, any> AST Fallback
   * @description Returns a Record<string, any>
   */
  .get("/ast/record-any", (c) => {
    const data: Record<string, any> = { foo: 1, bar: "string" };
    return c.json(data, 200);
  })

  /**
   * @summary Test Complex Nested Record
   * @description Returns a deeply nested Record with unions
   */
  .get("/ast/complex-record", (c) => {
    type NestedType = {
      id: string;
      metadata: Record<string, number | boolean>;
      tags: Array<string | null>;
    };
    const data: Record<string, NestedType> = {
      user1: {
        id: "u1",
        metadata: { score: 100, active: true },
        tags: ["vip", null],
      },
    };
    return c.json(data, 200);
  })

  /**
   * @summary Test AST Union Fallback
   * @description Returns a union of literal strings and objects
   */
  .get("/ast/union", (c) => {
    type StatusResponse =
      | "success"
      | "pending"
      | { error: string; code: number }
      | null;

    const data = "success" as StatusResponse;
    return c.json(data, 200);
  })

  .get("/ast/regex/:id{[0-9]+}/details/:code{[A-Z]{3}}", (c) =>
    c.json({ ok: true }, 200),
  )

  /**
   * @summary Test Date Regex Parameter
   * @description Extracts a complex regex with slashes and exact counts
   */
  .get("/ast/regex/date/:date{\\d{4}-\\d{2}-\\d{2}}", (c) =>
    c.json({ date: c.req.param("date") }, 200),
  )

  /**
   * @summary Test Literal OR Regex Parameter
   * @description Tests regex that uses pipe for literal matching
   */
  .get("/ast/regex/action/:type{buy|sell|trade}", (c) =>
    c.json({ action: c.req.param("type") }, 200),
  )

  /**
   * @summary Test Wildcard Regex Parameter
   * @description Tests wildcard catch-all regexes
   */
  .get("/ast/regex/wildcard/:path{.*}", (c) =>
    c.json({ path: c.req.param("path") }, 200),
  )

  /**
   * @summary Test Array Query Parameters
   * @description Verifies OpenAPI style and explode styling for query arrays
   */
  .get(
    "/query/array-styling",
    zValidator(
      "query",
      z.object({
        tags: z.array(z.string()).optional(),
        filters: z.union([z.string(), z.array(z.string())]).optional(),
      }),
    ),
    (c) => c.json({ ok: true }, 200),
  )

  /**
   * @summary Test Mixed Parameters
   * @description Verifies array formatting only applies to query parameters and doesn't pollute headers or path
   */
  .get(
    "/query/mixed-styling/:id",
    zValidator("param", z.object({ id: z.string() })),
    zValidator(
      "query",
      z.object({ tags: z.array(z.string()), page: z.number() }),
    ),
    zValidator(
      "header",
      z.object({
        "x-tags": z.array(z.string()).optional(),
        "x-id": z.string().optional(),
      }),
    ),
    (c) => c.json({ ok: true }, 200),
  )

  /**
   * @summary Test AST Response Headers
   * @description Verifies AST extraction of c.header
   */
  .get("/headers/ast", (c) => {
    c.header("X-RateLimit-Limit", "1000");
    c.header("X-RateLimit-Remaining", "999");
    return c.json({ ok: true }, 200);
  })

  /**
   * @summary Test JSDoc Response Headers
   * @description Verifies JSDoc extraction of @responseHeader
   * @responseHeader 200 X-Trace-Id string The trace ID
   * @responseHeader 200 Set-Cookie string The session cookie
   */
  .get("/headers/jsdoc", (c) => {
    // Simulating middleware setting the headers
    return c.json({ ok: true }, 200);
  })

  /**
   * @summary Test Hybrid Response Headers
   * @description Verifies JSDoc overrides AST fallback
   * @responseHeader 200 X-Cache string Overridden description from JSDoc
   */
  .get("/headers/mixed", (c) => {
    c.header("X-Cache", "MISS"); // AST will find this, but JSDoc should provide the description
    c.header("X-Server", "Hono"); // AST will find this exclusively
    return c.json({ ok: true }, 200);
  });

export const exhaustiveRoutes = app;
