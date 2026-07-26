import { z } from "zod";
import { UserRoles } from "./constants";

export const baseSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(UserRoles),
});
