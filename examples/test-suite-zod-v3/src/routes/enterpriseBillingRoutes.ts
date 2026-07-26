import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { vValidator } from "@hono/valibot-validator";
import { tbValidator } from "@hono/typebox-validator";

import {
  BillingReportFilterSchema,
  InvoicePathParamsSchema,
  ClientIPQuerySchema,
  EnterpriseHeadersSchema,
} from "../schemas/enterpriseBillingSchemas";

// Deeply nested router structure
const invoiceRouter = new Hono()
  // 1. Heavy mixed validation route using exported schemas
  .post(
    "/:invoiceId/adjust",
    vValidator("param", InvoicePathParamsSchema),
    vValidator("query", ClientIPQuerySchema),
    tbValidator("header", EnterpriseHeadersSchema),
    zValidator("json", BillingReportFilterSchema),
    (c) => {
      return c.json({
        success: true,
        message: "Invoice successfully adjusted with complex validations.",
        params: c.req.valid("param"),
        query: c.req.valid("query"),
        headers: c.req.valid("header"),
        body: c.req.valid("json"),
      });
    },
  )
  // 2. Heavy mixed validation route using inline schemas (to trigger AST fallback testing)
  .put(
    "/:invoiceId/dispute",
    zValidator(
      "param",
      z.object({
        orgId: z.string().uuid(),
        invoiceId: z.string().regex(/^INV-\d{4}-\d{6}$/),
      }),
    ),
    zValidator(
      "query",
      z.object({
        reason: z.enum(["wrong_amount", "duplicate", "other"]),
        urgency: z.union([
          z.literal("high"),
          z.literal("normal"),
          z.literal("low"),
        ]),
      }),
    ),
    zValidator(
      "json",
      z.object({
        disputedAmount: z.number().positive(),
        evidenceAttachments: z.array(z.string().url()).max(5).optional(),
      }),
    ),
    (c) => {
      return c.json({ success: true, status: "disputed" });
    },
  );

const billingRouter = new Hono().route("/invoices", invoiceRouter);
const orgRouter = new Hono().route("/:orgId/billing", billingRouter);
const app = new Hono().route("/orgs", orgRouter);

export const enterpriseBillingRoutes = app;
