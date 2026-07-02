import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const productFilterSchema = z.object({
  category: z.string().optional().describe("Filter products by category ID"),
  inStock: z.string().transform(v => v === "true").optional().describe("Filter by availability"),
  limit: z.string().default("20").describe("Pagination limit"),
  page: z.string().default("1").describe("Pagination page number"),
});

const productResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  price: z.number().positive(),
  currency: z.literal("USD").default("USD"),
  inventoryCount: z.number().int().min(0),
  categories: z.array(z.string()),
});

export const productRoutes = new Hono()
  /**
   * @summary List Catalog Products
   * @description Returns a paginated list of all active products in the store catalog.
   * @tag Catalog
   */
  .get("/", zValidator("query", productFilterSchema), (c) => {
    const query = c.req.valid("query");
    return c.json({
      data: [
        {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Enterprise Server Rack",
          description: "42U standard IT server rack enclosure.",
          price: 1299.99,
          currency: "USD",
          inventoryCount: 15,
          categories: ["hardware", "infrastructure"],
        }
      ],
      meta: { page: Number(query.page), limit: Number(query.limit), total: 1 }
    });
  })

  /**
   * @summary Retrieve Product Details
   * @description Fetches the full product details, including pricing and inventory data, by its unique ID.
   * @tag Catalog
   */
  .get("/:productId", zValidator("param", z.object({ productId: z.string().uuid() })), (c) => {
    const { productId } = c.req.valid("param");
    return c.json({
      id: productId,
      name: "Enterprise Server Rack",
      description: "42U standard IT server rack enclosure.",
      price: 1299.99,
      currency: "USD",
      inventoryCount: 15,
      categories: ["hardware", "infrastructure"],
    });
  });
