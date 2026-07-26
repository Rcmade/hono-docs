import { Type as t } from "@sinclair/typebox";
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
const EnterpriseHeadersSchema = t.Intersect([AuthHeaders, TracingHeaders]);
console.log(JSON.stringify(EnterpriseHeadersSchema, null, 2));
