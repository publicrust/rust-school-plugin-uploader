#!/usr/bin/env node
// CHANGE: Delegate execution to modular CLI runner.
// WHY: Allows importing CLI helpers without triggering immediate command parsing.
// QUOTE(TЗ): "CLI: `plugins notify` — основной режим ... `plugins dry-run` ... `plugins reset` ... `plugins state`."
// REF: REQ-7
// SOURCE: internal reasoning

import { pathToFileURL } from "url";
import { runCli } from "./cli.js";

const executedDirectly = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (executedDirectly) {
  void runCli(process.argv);
}

export { runCli };
