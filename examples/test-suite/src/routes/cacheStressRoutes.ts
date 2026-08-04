import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const simpleSchema = z.object({
  name: z.string(),
  value: z.number().int(),
});

// Cache stress routes testing repetitive local suffixes across multiple prefixes
export const cacheStressRoutes = new Hono()
  // 1-10: Item operations
  .get("/item/list", (c) => c.json({ items: [] }))
  .post("/item/create", zValidator("json", simpleSchema), (c) => c.json({ created: true }, 201))
  .get("/item/:id", (c) => {
    const id = c.req.param("id");
    return c.json({ id, type: "item" });
  })
  .put("/item/:id/update", zValidator("json", simpleSchema), (c) => c.json({ updated: true }))
  .delete("/item/:id/delete", (c) => c.json({ deleted: true }))
  .patch("/item/:id/status", (c) => c.json({ status: "active" }))
  .get("/item/:id/details", (c) => c.json({ details: "item details" }))
  .post("/item/:id/archive", (c) => c.json({ archived: true }))
  .post("/item/:id/restore", (c) => c.json({ restored: true }))
  .get("/item/search", (c) => {
    const q = c.req.query("q");
    return c.json({ results: [], query: q });
  })

  // 11-20: Order operations (deliberately reusing identical suffixes to stress test AST route indexing!)
  .get("/order/list", (c) => c.json({ orders: [] }))
  .post("/order/create", zValidator("json", simpleSchema), (c) => c.json({ created: true, orderId: "ord_123" }, 201))
  .get("/order/:id", (c) => {
    const id = c.req.param("id");
    return c.json({ id, type: "order" });
  })
  .put("/order/:id/update", zValidator("json", simpleSchema), (c) => c.json({ updated: true }))
  .delete("/order/:id/delete", (c) => c.json({ deleted: true }))
  .patch("/order/:id/status", (c) => c.json({ status: "shipped" }))
  .get("/order/:id/details", (c) => c.json({ details: "order details" }))
  .post("/order/:id/archive", (c) => c.json({ archived: true }))
  .post("/order/:id/restore", (c) => c.json({ restored: true }))
  .get("/order/search", (c) => {
    const q = c.req.query("q");
    return c.json({ results: [], query: q });
  })

  // 21-30: User operations with varied JSDoc descriptions and response headers
  /**
   * @summary Retrieve all users
   * @description Fetches a paginated user directory.
   * @tag Users
   */
  .get("/user/list", (c) => {
    c.header("X-Total-Count", "100");
    return c.json({ users: [] });
  })
  /**
   * @summary Create a user
   * @description Register a new active user account.
   * @tag Users
   */
  .post("/user/create", zValidator("json", simpleSchema), (c) => {
    return c.json({ userId: "usr_001" }, 201);
  })
  .get("/user/:id", (c) => c.json({ id: c.req.param("id"), role: "admin" }))
  .put("/user/:id/update", zValidator("json", simpleSchema), (c) => c.json({ updated: true }))
  .delete("/user/:id/delete", (c) => c.json({ deleted: true }))
  .patch("/user/:id/status", (c) => c.json({ status: "active" }))
  .get("/user/:id/details", (c) => c.json({ bio: "Engineer" }))
  .post("/user/:id/archive", (c) => c.json({ archived: true }))
  .post("/user/:id/restore", (c) => c.json({ restored: true }))
  .get("/user/search", (c) => c.json({ results: [] }));
