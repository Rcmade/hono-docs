export const HONO_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
]);

export const VALIDATOR_TARGETS = [
  "json",
  "form",
  "query",
  "param",
  "header",
  "cookie",
] as const;
