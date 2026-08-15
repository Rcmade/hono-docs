import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { vValidator } from "@hono/valibot-validator";
import { arktypeValidator } from "@hono/arktype-validator";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema as createZodSchema } from "drizzle-zod";
import { createInsertSchema as createValibotSchema } from "drizzle-valibot";
import { type as arktype } from "arktype";
import { z } from "zod";
import * as v from "valibot";

export const roleEnum = pgEnum("role", ["admin", "editor", "viewer"]);

// Complex Drizzle Schema
const complexUsers = pgTable("complex_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  age: integer("age"),
  isActive: boolean("is_active").default(true).notNull(),
  role: roleEnum("role").default("viewer").notNull(),
  metadata: jsonb("metadata").$type<{
    preferences: { theme: "dark" | "light"; notifications: boolean };
    tags: string[];
  }>(),
  createdAt: text("created_at").default("now()").notNull(),
  lastLoginAt: text("last_login_at"),
});

// Drizzle-Zod Schema with Refinements
export const insertUserZod = createZodSchema(complexUsers, {
  email: z.string().email(),
  age: z.number().min(18).max(120).optional(),
});

// Drizzle-Valibot Schema with Refinements
export const insertUserValibot = createValibotSchema(complexUsers, {
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.pipe(v.number(), v.minValue(18), v.maxValue(120))),
});

// Complex Arktype Schema
export const myArktypeSchema = arktype({
  id: "string", // uuid is not supported by toJsonSchema natively
  userProfile: {
    username: "string >= 3",
    "email?": "string.email",
    age: "number > 0",
    role: "'admin' | 'user' | 'guest'",
    isActive: "boolean",
  },
  tags: "string[]",
  metadata: {
    lastLogin: "string",
    settings: {
      theme: "'dark' | 'light' | 'system'",
      notifications: "boolean",
    },
    "customData?": "unknown",
  },
  scores: "number[]",
  status: "'active' | 'inactive' | 'pending'",
  "avatarUrl?": "string", // url is not supported by toJsonSchema natively
  nestedTuple: ["string", "number", "boolean"],
  unionTest: "string | number | boolean",
});

export const newFrameworksRoutes = new Hono()
  .post("/drizzle-zod", zValidator("json", insertUserZod), (c) =>
    c.json({ success: true, data: c.req.valid("json") }),
  )
  .post("/drizzle-valibot", vValidator("json", insertUserValibot), (c) =>
    c.json({ success: true, data: c.req.valid("json") }),
  )
  .post("/arktype", arktypeValidator("json", myArktypeSchema), (c) =>
    c.json({ success: true, data: c.req.valid("json") }),
  );
