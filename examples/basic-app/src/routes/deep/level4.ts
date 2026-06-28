import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ComplexUserPayload,
  QuerySchema,
  HeadersSchema,
  ErrorResponse,
} from "./schemas";
import { hc } from "hono/client";

export const level4 = new Hono()
  /**
   * @summary The Boss Level API
   * @description A tremendously complex endpoint testing query params, headers, path params, complex JSON bodies, and multiple status codes.
   * @tag Boss Level
   */
  .post(
    "/boss/:organizationId/resource/:resourceId",
    zValidator(
      "param",
      z.object({ organizationId: z.string().uuid(), resourceId: z.string() }),
    ),
    zValidator("query", QuerySchema),
    zValidator("header", HeadersSchema),
    zValidator("json", ComplexUserPayload),
    (c) => {
      // Mock business logic
      const { organizationId, resourceId } = c.req.valid("param");
      const query = c.req.valid("query");
      const payload = c.req.valid("json");

      if (organizationId === "00000000-0000-0000-0000-000000000000") {
        return c.json(
          {
            success: false as const,
            error: {
              code: "FORBIDDEN",
              message: "Cannot modify this organization.",
            },
          },
          403,
        );
      }

      if (resourceId === "not-found") {
        return c.json(
          {
            success: false as const,
            error: { code: "NOT_FOUND", message: "Resource missing." },
          },
          404,
        );
      }

      if (payload.metadata?.fail) {
        return c.json(
          {
            success: false as const,
            error: {
              code: "INTERNAL_ERROR",
              message: "Something went terribly wrong.",
            },
          },
          500,
        );
      }

      // Success 201 Response
      return c.json(
        {
          success: true as const,
          message: "Complex resource created successfully",
          echo: {
            org: organizationId,
            res: resourceId,
            pagination: query,
            data: payload,
          },
          timestamp: new Date().toISOString(),
        },
        201,
      );
    },
  );
