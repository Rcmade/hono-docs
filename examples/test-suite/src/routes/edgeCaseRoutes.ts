import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

interface CustomItem {
  id: string;
  name: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

const legacySchema = z.object({
  oldApiKey: z.string(),
  reason: z.string().optional(),
});

// Sub-router for testing deep route composition
const nestedSubRouter = new Hono()
  .get("/sub-resource", (c) => c.json({ nested: true, level: "sub-resource" }))
  .post("/sub-action", (c) => c.json({ action: "triggered" }, 201))
  .get("/sub-item/:subId", (c) => c.json({ subId: c.req.param("subId") }))
  .delete("/sub-item/:subId", (c) => c.json({ removed: true }, 200))
  .patch("/sub-item/:subId/flag", (c) => c.json({ flagged: true }));

export const edgeCaseRoutes = new Hono()
  // 1-5: Plain TS AST type annotations & interface return types
  .get("/ts-ast/simple", (c) => {
    const item: CustomItem = {
      id: "123",
      name: "Sample Item",
      tags: ["a", "b"],
    };
    return c.json(item);
  })
  .post("/ts-ast/echo", async (c) => {
    const body = (await c.req.json()) as CustomItem;
    return c.json({ received: body }, 201);
  })
  .put("/ts-ast/modify/:id", async (c) => {
    const id = c.req.param("id");
    return c.json({ modifiedId: id, status: "SUCCESS" });
  })
  .delete("/ts-ast/delete/:id", (c) =>
    c.json({ deleted: true, timestamp: Date.now() }),
  )
  .get("/ts-ast/optional/:opt?", (c) =>
    c.json({ opt: c.req.param("opt") || "default" }),
  )

  // 6-10: Union responses and status codes
  .get("/responses/union-status", (c) => {
    const random = Math.random();
    if (random > 0.5) {
      return c.json({ status: "ok", data: "Success value" }, 200);
    }
    return c.json({ error: "Not found", code: 404 }, 404);
  })
  .post("/responses/multi-status", (c) => {
    const val = "test";
    if (val === "test") return c.json({ created: true }, 201);
    return c.json({ error: "Invalid request" }, 400);
  })
  .get("/responses/server-error", (c) =>
    c.json({ error: "Internal Error" }, 500),
  )
  .delete("/responses/no-content-test", (c) => c.body(null, 204))
  .get("/responses/redirect-test", (c) => c.redirect("/api/target", 302))

  // 11-15: Varied path formatting and regex constraints
  .get("/regex/code/:code{[A-Z]{4}}", (c) =>
    c.json({ validCode: c.req.param("code") }),
  )
  .get("/regex/year/:year{[0-9]{4}}/month/:month{[0-9]{2}}", (c) =>
    c.json({ year: c.req.param("year"), month: c.req.param("month") }),
  )
  .get("/wildcard/files/*", (c) => c.json({ wildcard: true }))
  .all("/all-handler/check", (c) => c.json({ method: "ALL" }))
  .get("/headers/custom-test", (c) => {
    c.header("Cache-Control", "no-cache");
    c.header("X-Custom-Token", "token_123");
    return c.json({ authed: true });
  })

  // 16-20: Deep routing integration
  .route("/deep", nestedSubRouter)

  // 21-25: Miscellaneous endpoints
  .get("/misc/status", (c) => c.json({ healthy: true, uptime: 3600 }))
  .post("/misc/ping", (c) => c.json({ pong: true }))
  .put("/misc/reset", (c) => c.json({ reset: "done" }))
  .delete("/misc/cleanup", (c) => c.json({ cleaned: true }))
  .get("/misc/info", (c) =>
    c.json({ version: "2.0.0", name: "Hono Test Engine" }),
  )

  // 26-32: JSDoc tags testing (@deprecated, @example, @responseDescription, @ignore)
  /**
   * @summary Legacy Migration Endpoint
   * @description Migrates a legacy account to the new system.
   * @deprecated Use /api/v2/migrate instead
   * @responseDescription 200 Successfully triggered legacy account migration
   * @example { "oldApiKey": "legacy_key_12345", "reason": "System Upgrade" }
   * @example 200 { "migrated": true, "newAccountId": "acc_999" }
   */
  .post("/legacy/migrate", zValidator("json", legacySchema), (c) => {
    return c.json({ migrated: true, newAccountId: "acc_999" }, 200);
  })

  /**
   * @summary Bare Deprecated Endpoint
   * @deprecated
   * @responseDescription 200 Returns status
   */
  .get("/legacy/bare-deprecated", (c) => c.json({ deprecated: true }))

  /**
   * @summary Multi-Example Request & Responses
   * @description Demonstrates multiple named examples for request body and status codes.
   * @example { "oldApiKey": "key_alpha", "reason": "Batch Alpha" }
   * @example { "oldApiKey": "key_beta", "reason": "Batch Beta" }
   * @responseDescription 201 Account successfully provisioned
   * @responseDescription 400 Validation failed
   * @example 201 { "created": true, "id": "acc_101" }
   * @example 201 { "created": true, "id": "acc_102" }
   * @example 400 { "error": "Invalid API key format" }
   */
  .post("/legacy/multi-example", zValidator("json", legacySchema), (c) => {
    const random = Math.random();
    if (random > 0.5) return c.json({ created: true, id: "acc_101" }, 201);
    return c.json({ error: "Invalid API key format" }, 400);
  })

  /**
   * @summary Form Upload with Examples
   * @example "plain text raw example"
   * @responseDescription 200 Upload received successfully
   * @responseHeader 200 X-Upload-ID [string] Unique upload identifier
   */
  .post(
    "/legacy/form-upload",
    zValidator(
      "form",
      z.object({
        fileTitle: z.string(),
        fileTag: z.string().optional(),
      }),
    ),
    (c) => {
      c.header("X-Upload-ID", "upl_777");
      return c.json({ uploaded: true });
    },
  )

  /**
   * @summary Internal Hidden Route
   * @ignore
   */
  .get("/legacy/hidden-secret", (c) => c.json({ secret: "classified" }));
