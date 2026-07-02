import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const loginSchema = z.object({
  email: z.string().email().describe("User's registered email address"),
  password: z.string().min(8).describe("User's password"),
});

const registerSchema = z.object({
  firstName: z.string().min(2).describe("User's first name"),
  lastName: z.string().min(2).describe("User's last name"),
  email: z.string().email().describe("A valid corporate or personal email"),
  password: z.string().min(12).describe("A strong password (12+ characters)"),
  company: z.string().optional().describe("Company name, if applicable"),
});

export const authRoutes = new Hono()
  /**
   * @summary Authenticate User
   * @description Authenticates a user and returns a signed JWT session token.
   * @tag Authentication
   */
  .post("/login", zValidator("json", loginSchema), (c) => {
    const { email } = c.req.valid("json");
    return c.json({ token: "jwt_token_example", user: { email } });
  })

  /**
   * @summary Register New Account
   * @description Provisions a new user account in the system and sends a verification email.
   * @tag Authentication
   */
  .post("/register", zValidator("json", registerSchema), (c) => {
    const data = c.req.valid("json");
    return c.json({ success: true, id: "usr_12345", email: data.email }, 201);
  })

  /**
   * @summary Logout User
   * @description Invalidates the current user session and clears authentication cookies.
   * @tag Authentication
   */
  .post("/logout", (c) => {
    return c.json({ success: true, message: "Successfully logged out" });
  });
