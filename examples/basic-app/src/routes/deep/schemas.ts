import { z } from "zod";

export const RoleEnum = z.enum(["admin", "manager", "user", "guest"]);

export const AddressSchema = z.object({
  street: z.string().min(5),
  city: z.string(),
  zipcode: z.string().regex(/^\d{5}-\d{4}$/),
  coordinates: z.tuple([z.number(), z.number()]).optional(),
});

export const DeepConfigSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
);

export const ComplexUserPayload = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(20),
  roles: z.array(RoleEnum).min(1),
  profile: z.object({
    bio: z.string().optional(),
    avatarUrl: z.string().url().nullable(),
    address: AddressSchema,
  }),
  settings: DeepConfigSchema,
  metadata: z.any().optional(),
});

export const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const HeadersSchema = z.object({
  "x-api-key": z.string().length(32),
  "x-client-id": z.string().uuid(),
});

export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.any()).optional(),
  }),
});
