import type { Project } from "ts-morph";
import type { OpenAPIV3 } from "openapi-types";
import type {
  HONO_METHOD_NAMES,
  VALIDATOR_TARGETS,
  VALIDATOR_LIBRARIES,
} from "../utils/constants";

/** Supported lowercase Hono HTTP methods */
export type HonoMethod = (typeof HONO_METHOD_NAMES)[number];

/** Supported uppercase HTTP methods for documentation and logging */
export type HttpMethod = Uppercase<HonoMethod>;

/**
 * The base OpenAPI configuration, excluding dynamically generated fields.
 *
 * This config maps directly to the OpenAPI 3.0 `Document` type,
 * excluding `paths`, `components`, and `tags` which are generated.
 */
export type OpenAPIConfig = Omit<
  OpenAPIV3.Document,
  "paths" | "components" | "tags"
>;

/**
 * Describes a single HTTP API endpoint under a route.
 */
export type Api = {
  /**
   * The path of the API (excluding any prefix), e.g., `/devices/d/{deviceId}`.
   */
  api: string;

  /**
   * Optional summary displayed in generated docs.
   */
  summary?: string;

  /**
   * Detailed description of the endpoint for OpenAPI docs.
   */
  description?: string;

  /**
   * OpenAPI tags used to group this endpoint in the docs.
   */
  tag?: string[];

  /**
   * HTTP method supported by this endpoint.
   */
  method: "get" | "post" | "put" | "patch" | "delete";
};

/**
 * Represents a group of related API routes, each with a shared prefix and appType.
 */
export type ApiGroup = {
  /**
   * URL prefix applied to all `api` paths within this group (e.g., `/auth`).
   */
  apiPrefix: string;

  /**
   * File path to the module exporting `AppType = typeof routeInstance`.
   */
  appTypePath: string;

  /**
   * Human-readable name for the group, shown in logs and docs.
   */
  name: string;

  /**
   * Optional list of specific routes to include; if omitted, all from AppType are used.
   */
  api?: Api[];
};

/**
 * Top-level configuration object for hono-docs.
 */
export type HonoDocsConfig = {
  /**
   * Path to your `tsconfig.json`.
   */
  tsConfigPath: string;

  /**
   * Static parts of the OpenAPI document (title, version, servers, etc.).
   */
  openApi: OpenAPIConfig;

  /**
   * Output configuration for generated files.
   */
  outputs: {
    /**
     * File path where the generated `openapi.json` should be saved.
     */
    openApiJson: string;
  };

  /**
   * List of API groups (routes) to generate docs for.
   */
  apis: ApiGroup[];

  /**
   * Optional raw string content to inject at the top of each generated `.d.ts` snapshot.
   */
  preDefineTypeContent?: string;
};

/**
 * Used to track a source route definition's `AppType` and friendly name.
 */
export type AppTypeSnapshotPath = {
  /**
   * File path to the AppType export.
   */
  appTypePath: string;

  /**
   * Human-readable name for this route module.
   */
  name: string;
};

/**
 * Represents a single OpenAPI spec file output path.
 */
export type OpenApiPath = {
  /**
   * Path to the generated `openapi.json` file.
   */
  openApiPath: string;
};

/**
 * Identifies which validation library a schema originated from.
 */
export type ValidatorLibrary = (typeof VALIDATOR_LIBRARIES)[number];

/** Supported schema resolution engine labels used in documentation and CLI logging */
export type SchemaEngine = ValidatorLibrary | "ts type" | "no input";

/**
 * Valid slots that a Hono validator can target.
 */
export type ValidatorTarget = (typeof VALIDATOR_TARGETS)[number];

/**
 * Enriched source tracking for logged and cached endpoints.
 */
export type RouteSource = {
  src: ValidatorTarget;
  library: ValidatorLibrary | "ts type";
};

/**
 * Result returned by the schema resolver subsystem.
 */
export type SchemaResolverResult = {
  /** Whether schema was resolved from live runtime or fell back to type inference */
  source: "dynamic" | "fallback";
  /** Which validation library was detected */
  library: ValidatorLibrary;
  /** The final OpenAPI-compliant schema object */
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
};

/**
 * Parameters required to generate the OpenAPI spec and TypeScript snapshots.
 */
export type GenerateParams = {
  /**
   * Full hono-docs configuration object.
   */
  config: HonoDocsConfig;

  /**
   * Path to the output directory for emitted `.d.ts` files (typically inside `node_modules`).
   */
  libDir: string;

  /**
   * ts-morph project instance for analyzing TypeScript code.
   */
  project: Project;

  /**
   * Root path of the user’s project.
   */
  rootPath: string;

  /**
   * File name for the `.d.ts` output snapshot.
   */
  fileName: string;

  /**
   * Output directory for the OpenAPI and snapshot files.
   */
  outputRoot: string;
};
