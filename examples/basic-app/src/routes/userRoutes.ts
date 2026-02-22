import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const userSchema = z.object({
  name: z.string().min(1).describe("The user's full name"),
  email: z.email().describe("The user's email address"),
  age: z.number().int().min(18).optional().describe("The user's age (must be at least 18)"),
});

const querySchema = z.object({
  page: z.string().optional().default("1").describe("Page number for pagination"),
  limit: z.string().optional().default("10").describe("Number of items per page"),
  search: z.string().optional().describe("Search term to filter users"),
});

const idParamSchema = z.object({
  id: z.uuid().describe("The user's UUID"),
});

const headerSchema = z.object({
  "x-api-key": z.string().min(10).describe("API Key for authentication"),
  "user-agent": z.string().optional().describe("User Agent string"),
});

const cookieSchema = z.object({
  "session_id": z.string().describe("Session ID from cookie"),
});

const formSchema = z.object({
  avatarUrl: z.url().optional().describe("URL to user's avatar image"),
  bio: z.string().max(200).describe("User biography"),
});

export const userRoutes = new Hono()
  /**
   * Get Current User
   * Returns the profile of the currently authenticated user.
   */
  .get("/me", (c) => {
    return c.json({ id: "current-user-uuid", name: "current user", email: "user@example.com" });
  })

  /**
   * List Users
   * Retrieves a paginated list of users.
   */
  .get(
    "/",
    zValidator("query", querySchema),
    (c) => {
      const query = c.req.valid("query");
      return c.json({ data: [], meta: query, total: 0 });
    }
  )

  /**
   * Create User
   * Creates a new user in the system.
   */
  .post(
    "/",
    zValidator("json", userSchema),
    (c) => {
      const body = c.req.valid("json");
      return c.json({ success: true, user: { id: "new-uuid", ...body } }, 201);
    }
  )

  /**
   * Get User by ID
   * Retrieves a specific user's details by their UUID.
   */
  .get(
    "/:id",
    zValidator("param", idParamSchema),
    (c) => {
      const { id } = c.req.valid("param");
      
      if (id === "00000000-0000-0000-0000-000000000000") {
        return c.json({ success: false, message: "User not found" }, 404);
      }
      
      return c.json({ id, name: "John Doe", email: "john@example.com", age: 30 }, 200);
    }
  )

  /**
   * Update User
   * Updates an existing user's information.
   */
  .put(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", userSchema),
    (c) => {
      const { id } = c.req.valid("param");
      const data = c.req.valid("json");
      return c.json({ success: true, updated: { id, ...data } });
    }
  )

  /**
   * Delete User
   * Removes a user from the system.
   */
  .delete(
    "/:id",
    zValidator("param", idParamSchema),
    (c) => {
      const { id } = c.req.valid("param");
      return c.json({ success: true, deletedId: id });
    }
  )

  /**
   * Update Profile Context (Header & Cookie)
   * Demonstrates header and cookie validation.
   */
  .patch(
    "/profile/context",
    zValidator("header", headerSchema),
    zValidator("cookie", cookieSchema),
    (c) => {
      const headers = c.req.valid("header");
      const cookies = c.req.valid("cookie");
      return c.json({ success: true, headers, cookies });
    }
  )

  /**
   * Update Bio (Form Data)
   * Demonstrates form data (body) validation.
   */
  .post(
    "/profile/bio",
    zValidator("form", formSchema),
    (c) => {
      const form = c.req.valid("form");
      return c.json({ success: true, form });
    }
  );

export type AppType = typeof userRoutes;
