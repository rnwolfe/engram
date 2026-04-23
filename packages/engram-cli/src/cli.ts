#!/usr/bin/env bun

import { Command } from "commander";
import { ENGINE_VERSION } from "engram-core";
import { registerAdd } from "./commands/add.js";
import { registerCompanion } from "./commands/companion.js";
import { registerContext } from "./commands/context.js";
import { registerDecay } from "./commands/decay.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerEmbed } from "./commands/embed.js";
import { registerExport } from "./commands/export.js";
import { registerHistory } from "./commands/history.js";
import { registerIngest } from "./commands/ingest.js";
import { registerInit } from "./commands/init.js";
import { registerMaintenance } from "./commands/maintenance.js";
import { registerOwnership } from "./commands/ownership.js";
import { registerPlugin } from "./commands/plugin.js";
import { registerProject } from "./commands/project.js";
import { registerReconcile } from "./commands/reconcile.js";
import { registerSearch } from "./commands/search.js";
import { registerShow } from "./commands/show.js";
import { registerStats } from "./commands/stats.js";
import { registerStatus } from "./commands/status.js";
import { registerSync } from "./commands/sync.js";
import { registerVerify } from "./commands/verify.js";
import { registerVisualize } from "./commands/visualize.js";

const program = new Command()
  .name("engram")
  .description(
    "A local-first temporal knowledge graph engine for developer memory",
  )
  .version(ENGINE_VERSION)
  .addHelpText(
    "after",
    `
Typical lifecycle:
  1. engram init              Create a new graph (prompts for embedding model)
  2. engram ingest git        Ingest commit history
  3. engram ingest enrich github --token …
  4. engram context "<query>" Get a context pack for an agent
  5. engram reconcile         Maintain projections as substrate grows
  6. engram status            Check health

Run 'engram <command> --help' for details on a command.`,
  );

registerInit(program);
registerAdd(program);
registerCompanion(program);
registerContext(program);
registerEmbed(program);
registerSearch(program);
registerShow(program);
registerHistory(program);
registerDecay(program);
registerDoctor(program);
registerOwnership(program);
registerStats(program);
registerStatus(program);
registerIngest(program);
registerExport(program);
registerProject(program);
registerVerify(program);
registerMaintenance(program);
registerReconcile(program);
registerVisualize(program);
registerPlugin(program);
registerSync(program);

program.parse();
