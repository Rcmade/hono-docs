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

export const PROJECT_CACHE_DIR_NAME = ".hono-docs";

export const VALIDATOR_LIBRARIES = [
  "zod",
  "valibot",
  "typebox",
  "yup",
  "arktype",
  "unsupported",
] as const;

export const OPENAPI_VERSIONS = {
  v3_0: "3.0.3",
  v3_1: "3.1.0",
} as const;

export const ZOD_TARGETS = {
  v3_0: "openapi-3.0",
  v3_1: "openapi-3.1",
  jsonSchema7: "jsonSchema7",
} as const;
