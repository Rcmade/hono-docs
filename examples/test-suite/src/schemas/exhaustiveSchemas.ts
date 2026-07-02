import { z } from "zod";

export const exhaustiveCookieSchema = z.object({
  session_id: z.string().uuid().describe("The user session token"),
  tracking: z.enum(["allow", "deny"]).optional(),
});

export const exhaustiveHeaderSchema = z.object({
  "x-api-key": z.string().min(10).describe("API Key"),
  "x-tenant-id": z.coerce.number().int(),
});

export const exhaustiveQuerySchema = z.object({
  filters: z.array(z.string()).min(1).max(5).optional(),
  page: z.coerce.number().min(1).default(1),
  includeDeleted: z.coerce.boolean().default(false),
});

export const exhaustivePathSchema = z.object({
  userId: z.string().regex(/^usr_[a-zA-Z0-9]+$/),
  documentId: z.string().uuid(),
});

export const exhaustiveFormSchema = z.object({
  profilePicture: z.instanceof(File).optional(),
  description: z.string().max(500),
  tags: z.array(z.string()),
  file: z.array(z.file()),
});

export const exhaustiveJsonSchema = z.object({
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
  settings: z.object({
    theme: z.literal("dark").or(z.literal("light")),
    notifications: z.boolean(),
  }),
  // Testing discriminated unions
  event: z.discriminatedUnion("type", [
    z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
    z.object({ type: z.literal("keypress"), key: z.string() }),
  ]),
});
