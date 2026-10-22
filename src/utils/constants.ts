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

export const OPENAPI_OPERATION_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const;

export const MUTATING_METHODS = new Set<string>(["post", "put", "patch"]);

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

export const VALIBOT_TARGETS = {
  openapi30: "openapi-3.0",
  draft2020: "draft-2020-12",
  draft07: "draft-07",
} as const;

export const ZOD_TO_VALIBOT_TARGET_MAP: Record<
  (typeof ZOD_TARGETS)[keyof typeof ZOD_TARGETS],
  (typeof VALIBOT_TARGETS)[keyof typeof VALIBOT_TARGETS]
> = {
  [ZOD_TARGETS.v3_0]: VALIBOT_TARGETS.openapi30,
  [ZOD_TARGETS.v3_1]: VALIBOT_TARGETS.draft2020,
  [ZOD_TARGETS.jsonSchema7]: VALIBOT_TARGETS.draft07,
} as const;

export const HONO_METHOD_PREFIX = "$" as const;

export const PATH_PARAM_REGEX =
  /:([a-zA-Z0-9_]+)(?:{([^{}]*(?:{[^{}]*}[^{}]*)*)})?/g;

export const ROUTER_CONSTANTS = {
  routeMethod: "route",
  honoIdentifier: "Hono",
  defaultRouterName: "default",
  inlineRouterPrefix: "inline_",
  inlineRouterName: "inline",
  functionRouterPrefix: "func_",
} as const;

export const JSDOC_TAGS = {
  summary: "summary",
  description: "description",
  tag: "tag",
  tags: "tags",
  deprecated: "deprecated",
  ignore: "ignore",
  exclude: "exclude",
  hide: "hide",
  example: "example",
  responseDescription: "responsedescription",
  responseDescriptionUnderscore: "response_description",
  response: "response",
  responseHeader: "responseheader",
} as const;

export const JSDOC_REGEXES = {
  example: /^(?:\[?(\d{3}|default)\]?)\s+([\s\S]*)$/,
  responseDescription: /^(\d{3}|default)\s+(.*)$/,
  responseHeader:
    /^(\d{3})\s+([a-zA-Z0-9\-_]+)(?:\s+\[([a-zA-Z]+)\])?(?:\s+(.*))?$/,
  tagWithDescription: /^([a-zA-Z0-9_\s]+?)\s*-\s*(.+)$/,
  routeMethodQuickCheck: /\.(get|post|put|delete|patch|all|options|head)\s*\(/i,
} as const;
