#!/usr/bin/env node
import yargs, { Options } from "yargs";
import { hideBin } from "yargs/helpers";
import { runGenerate, runWatch } from "../core";

const sharedOptions = {
  config: {
    alias: "c",
    type: "string",
    describe: "Path to config file",
    demandOption: true,
    default: "./hono-docs.ts",
  },
  "no-cache": {
    type: "boolean",
    describe: "Bypass the incremental cache and force a full regeneration",
    default: false,
  },
} as const satisfies Record<string, Options>;

yargs(hideBin(process.argv))
  .scriptName("hono-docs")
  .command(
    "generate",
    "Generate OpenAPI JSON",
    (y) =>
      y.options(sharedOptions).option("watch", {
        alias: "w",
        type: "boolean",
        describe: "Watch for file changes and seamlessly rebuild",
        default: false,
      }),
    async (argv) => {
      try {
        const noCache = argv.cache === false || argv["no-cache"] === true;
        if (argv.watch) {
          await runWatch(argv.config, { noCache });
        } else {
          await runGenerate(argv.config, { noCache });
        }
      } catch (e) {
        console.error("❌", e);
        process.exit(1);
      }
    },
  )
  .command(
    "validate",
    "Validate that the generated OpenAPI spec matches the source code without writing to disk",
    (y) => y.options(sharedOptions),
    async (argv) => {
      try {
        const noCache = argv.cache === false || argv["no-cache"] === true;
        await runGenerate(argv.config, { noCache, validate: true });
      } catch (e) {
        console.error("❌", (e as Error).message);
        process.exit(1);
      }
    },
  )
  .demandCommand(1)
  .help()
  .parse();
