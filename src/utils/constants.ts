export const HONO_METHOD_NAMES = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
] as const;

export const HONO_METHODS = new Set<string>(HONO_METHOD_NAMES);

export const VALIDATOR_TARGETS = [
  "json",
  "form",
  "query",
  "param",
  "header",
  "cookie",
] as const;
