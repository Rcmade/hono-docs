# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/rcmade/hono-docs/compare/v1.3.0...v1.4.0) (2026-08-27)


### Features

* add arktype support to schema-resolver and include new framework test routes ([937e3c8](https://github.com/rcmade/hono-docs/commit/937e3c8c6878cb00ecf842002a2a2c5efea91a40))
* add support for generating OpenAPI YAML files in configuration outputs ([d7cabce](https://github.com/rcmade/hono-docs/commit/d7cabced27a36fdcbb3aeb0f2614e9503895cd83))
* add validate command to verify OpenAPI spec consistency without disk modifications ([8a8ab2d](https://github.com/rcmade/hono-docs/commit/8a8ab2d390f772b3cc416f045f70d59ef52d7628))
* implement JSDoc parsing for deprecated tags, examples, and response descriptions in OpenAPI generation ([9b8480c](https://github.com/rcmade/hono-docs/commit/9b8480c3780cb8f0923556808e4c26a28de1f3a8))
* implement path-based route scoring to resolve ambiguous root-level path matches ([32ed0a7](https://github.com/rcmade/hono-docs/commit/32ed0a7ca164af48a6f4fa180aae220cd05b61c3))
* implement pluggable OpenAPI version adapters to support both 3.0 and 3.1 specifications ([88a4a09](https://github.com/rcmade/hono-docs/commit/88a4a098ad4118fb804c6b9aa2cb8602bdfa61b4))


### Bug Fixes

* add OpenAPI spec validation and improve path parameter regex and Valibot target support ([b37ed8c](https://github.com/rcmade/hono-docs/commit/b37ed8cdc9c73c4b253e619af5364bada1503715))

## [1.3.0](https://github.com/rcmade/hono-docs/compare/v1.2.3...v1.3.0) (2026-08-15)

### Features

- **watch:** Implement file watch mode (`--watch` / `-w`) for incremental live rebuilds ([1b3232f](https://github.com/rcmade/hono-docs/commit/1b3232fcc8b5d2afa3e024114fbdb17178d6eacc))
  - Persistent `ts-morph` project instance avoids cold-start overhead on every rebuild
  - Selective AST hot-reloading: only the changed source file is refreshed in-memory
  - 300 ms debounce to batch rapid successive saves into a single build
  - Queued build support: changes arriving during an active build trigger exactly one follow-up
  - `.gitignore`-aware watcher via `chokidar` + `ignore`; output directory is always excluded
  - Programmatic `runWatch(configPath, options)` API exported from the package root

- **dedup:** Automated schema deduplication and `$ref` component extraction for OpenAPI specs ([803aa0b](https://github.com/rcmade/hono-docs/commit/803aa0b5ac3f4b2b8cde0d5333aeaaa418d169da))
  - Named schemas (explicit `x-schema-name` / source type names) are always promoted to `components/schemas`
  - Anonymous schemas appearing in ≥ 2 operations are fingerprinted (SHA-256) and deduplicated automatically
  - `$defs` / `definitions` blocks from third-party validator libraries are hoisted to `components/schemas` and rewritten as standard `$ref` links
  - Collision-safe naming: conflicting names get an auto-incremented numeric suffix (`Schema`, `Schema_2`, …)
  - Runs automatically after generation — zero configuration required

- **cache:** Implement caching system and expand test-suite route coverage ([1c85621](https://github.com/rcmade/hono-docs/commit/1c85621ce000445b4dfeacbb91611719e97bd9b6))
  - Route index and validator schema results are persisted between builds keyed by file-content hash
  - `--no-cache` CLI flag bypasses cache for full clean regeneration (useful in CI/CD)
  - `runGenerate(path, { noCache: true })` programmatic option
  - Added `cacheStressRoutes`, `edgeCaseRoutes`, and `multiValidatorRoutes` to the test suite
  - Introduced `src/cache/cacheManager.ts` and `src/schema-resolver/routeIndex.ts`

### Documentation

- **readme:** Update README to include incremental caching details and refine schema inference description ([17990f8](https://github.com/rcmade/hono-docs/commit/17990f8479fd8b63fa305c2640267776469ceba9))

---

## [1.2.3](https://github.com/rcmade/hono-docs/compare/v1.1.4...v1.2.3) (2026-08-01)

### [1.1.4](https://github.com/rcmade/hono-docs/compare/v1.1.3...v1.1.4) (2026-07-05)
