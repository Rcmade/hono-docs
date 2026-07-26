import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// TS Utility type test shapes
interface UserProfile {
  id: string;
  name: string;
  email: string;
  age: number;
  tags: string[];
}

type UserPreview = Pick<UserProfile, "id" | "name">;
type UserWithoutAge = Omit<UserProfile, "age">;
type PartialUser = Partial<UserProfile>;
type ReadonlyUser = Readonly<UserProfile>;
type StringMap = Record<string, { keyName: string; count: number }>;

// Referenced handler style testing
const getReferenceHandler = (c: any) => {
  const data: UserPreview = { id: "123", name: "John Doe" };
  return c.json({ success: true, data });
};

// Sub-router definition for nested routing checks
const subRouter = new Hono()
  /**
   * @summary Sub route info
   * @description Get sub router info
   * @tag Complex Routing
   */
  .get("/info", (c) => {
    return c.json({ info: "Nested sub-route active" });
  })
  /**
   * @summary Sub route update
   * @description Perform sub router update
   * @tag Complex Routing
   */
  .post("/update", zValidator("json", z.object({ code: z.number() })), (c) => {
    return c.json({ updated: true, code: c.req.valid("json").code });
  });

export const complexRoutes = new Hono()
  // 1. Nested Route mounting
  .route("/nested", subRouter)

  // 2. Referenced handlers
  /**
   * @summary Reference Handler Test
   * @description Route that uses a separated/referenced handler function.
   * @tag Handler Types
   */
  .get("/reference-handler", getReferenceHandler)

  // 3. Complex path parameters (multiple + optional)
  /**
   * @summary Complex Path Parameters
   * @description Route with multiple path parameters and an optional one.
   * @tag Parameter Testing
   */
  .get(
    "/org/:orgId/projects/:projectId/:subTaskId?",
    zValidator(
      "param",
      z.object({
        orgId: z.string(),
        projectId: z.string(),
        subTaskId: z.string().optional(),
      }),
    ),
    (c) => {
      const params = c.req.valid("param");
      return c.json({ success: true, params });
    },
  )

  // 4. Regex parameters
  /**
   * @summary Regex Path Parameters
   * @description Route with regex constraints in parameters.
   * @tag Parameter Testing
   */
  .get(
    "/archive/:year{[0-9]{4}}/:month{[0-9]{2}}",
    zValidator(
      "param",
      z.object({
        year: z.string(),
        month: z.string(),
      }),
    ),
    (c) => {
      const params = c.req.valid("param");
      return c.json({ success: true, params });
    },
  )

  // 5. Wildcard route
  /**
   * @summary Wildcard Path Parameter
   * @description Route using a wildcard parameter.
   * @tag Parameter Testing
   */
  .get("/files/*", (c) => {
    const filePath = c.req.path;
    return c.json({ success: true, filePath });
  })

  // 6. Form data request validation
  /**
   * @summary Multipart Form Data Validation
   * @description Route that validates multipart/form-data or urlencoded form bodies.
   * @tag Body Testing
   */
  .post(
    "/upload-form",
    zValidator(
      "form",
      z.object({
        fileTitle: z.string(),
        fileSize: z.string().transform((v) => parseInt(v, 10)),
      }),
    ),
    (c) => {
      const { fileTitle, fileSize } = c.req.valid("form");
      return c.json({ success: true, fileTitle, fileSize });
    },
  )

  // 7. Route using app.all()
  /**
   * @summary All Methods Route
   * @description Route responding to any HTTP method.
   * @tag Method Testing
   */
  .all("/any-method", (c) => {
    return c.json({ method: c.req.method, message: "Handled successfully" });
  })

  // 8. Union Response Types with different status codes
  /**
   * @summary Union Status Code Responses
   * @description Route returning different JSON schemas depending on status code.
   * @tag Response Testing
   */
  .get("/union-responses", (c) => {
    const errorCondition = false;
    if (errorCondition) {
      return c.json({ success: false, error: "Validation failed" }, 400);
    }
    return c.json({ success: true, payload: { value: 42 } }, 200);
  })

  // 9. Complex typescript utility shapes response
  /**
   * @summary TypeScript Utility Shapes
   * @description Route returning Omit, Record, Partial, and Readonly types.
   * @tag Response Testing
   */
  .get("/ts-utilities", (c) => {
    const withoutAge: UserWithoutAge = {
      id: "u1",
      name: "Alice",
      email: "alice@test.com",
      tags: ["dev"],
    };
    const partialU: PartialUser = { id: "u2" };
    const readonlyU: ReadonlyUser = {
      id: "u3",
      name: "Bob",
      email: "bob@test.com",
      age: 30,
      tags: ["admin"],
    };
    const map: StringMap = {
      first: { keyName: "k1", count: 10 },
    };
    return c.json({
      success: true,
      withoutAge,
      partialU,
      readonlyU,
      map,
    });
  });
