import { z } from "zod";
import * as v from "valibot";
import { Type as t } from "@sinclair/typebox";

// ZOD: Deeply nested discriminated union for analytic reports
const BaseReportFilter = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  limit: z.number().int().min(1).max(1000).default(100),
});

export const BillingReportFilterSchema = z.discriminatedUnion("type", [
  BaseReportFilter.extend({
    type: z.literal("summary"),
    groupBy: z
      .array(z.enum(["department", "project", "user"]))
      .min(1)
      .max(3),
  }),
  BaseReportFilter.extend({
    type: z.literal("detailed"),
    includeTaxes: z.boolean().default(false),
    currency: z.string().length(3).default("USD"),
    minAmount: z.number().positive().optional(),
  }),
]);

// VALIBOT: Strict parameters for invoice querying
export const InvoicePathParamsSchema = v.object({
  orgId: v.pipe(v.string(), v.uuid("Invalid Organization UUID")),
  invoiceId: v.pipe(
    v.string(),
    v.regex(
      /^INV-\d{4}-\d{6}$/,
      "Invoice ID must match INV-YYYY-XXXXXX format",
    ),
  ),
});

export const ClientIPQuerySchema = v.object({
  ipAddress: v.optional(
    v.pipe(v.string(), v.ipv4("Must be a valid IPv4 address")),
  ),
});

// TYPEBOX: Complex header schema with intersection and pattern
const AuthHeaders = t.Object({
  "x-enterprise-token": t.String({
    pattern: "^ent_[a-zA-Z0-9]{32}$",
    description: "Enterprise SSO token",
  }),
  "x-client-version": t.String({
    description: "Client application version",
    default: "1.0.0",
  }),
});

const TracingHeaders = t.Object({
  "x-request-id": t.String({ format: "uuid" }),
  "x-correlation-id": t.Optional(t.String({ format: "uuid" })),
});

export const EnterpriseHeadersSchema = t.Intersect([
  AuthHeaders,
  TracingHeaders,
]);
