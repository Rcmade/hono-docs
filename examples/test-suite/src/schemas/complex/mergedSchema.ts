import { z } from "zod";
import { baseSchema } from "./baseSchema";
import { ALLOWED_DOMAINS } from "./constants";

export const createAccountSchema = baseSchema.extend({
  domain: z.string().refine((val) => ALLOWED_DOMAINS.includes(val), {
    message: "Domain not allowed",
  }),
  preferences: z.object({
    theme: z.enum(["light", "dark"]).default("light"),
  }),
});
