// CHANGE: Confirm CLI wiring exposes required subcommands.
// WHY: Verifies availability of notify/dry-run/reset/state entry points.
// QUOTE(TЗ): "CLI: `plugins notify` — основной режим ... `plugins dry-run` ... `plugins reset` ... `plugins state`."
// REF: REQ-7
// SOURCE: internal reasoning

import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";

describe("CLI program", () => {
  it("registers expected commands", () => {
    const program = buildProgram();
    const pluginsCommand = program.commands.find(command => command.name() === "plugins");
    expect(pluginsCommand).toBeDefined();
    const subCommands = pluginsCommand?.commands.map(command => command.name()) ?? [];
    expect(subCommands).toEqual(expect.arrayContaining(["notify", "dry-run", "reset", "state"]));
  });
});
