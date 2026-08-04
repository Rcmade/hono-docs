#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runGenerate } from "../core";

yargs(hideBin(process.argv))
  .scriptName("hono-docs")
  .command(
    "generate",
    "Generate OpenAPI JSON",
    (y) =>
      y
        .option("config", {
          alias: "c",
          type: "string",
          describe: "Path to config file",
          demandOption: true,
          default: "./hono-docs.ts",
        })
        .option("no-cache", {
          type: "boolean",
          describe: "Bypass the incremental cache and force a full regeneration",
          default: false,
        }),
    async (argv) => {
      try {
        // yargs converts --no-cache → argv.cache === false
        const noCache = argv.cache === false || argv["no-cache"] === true;
        await runGenerate(argv.config, { noCache });
      } catch (e) {
        console.error("❌", e);
        process.exit(1);
      }
    }
  )
  .demandCommand(1)
  .help()
  .parse();

