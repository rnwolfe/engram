#!/usr/bin/env node

import { Command } from "commander";
import { ENGINE_VERSION } from "engram-core";
import { registerAdd } from "./commands/add.js";
import { registerDecay } from "./commands/decay.js";
import { registerExport } from "./commands/export.js";
import { registerHistory } from "./commands/history.js";
import { registerIngest } from "./commands/ingest.js";
import { registerInit } from "./commands/init.js";
import { registerMaintenance } from "./commands/maintenance.js";
import { registerOwnership } from "./commands/ownership.js";
import { registerReconcile } from "./commands/reconcile.js";
import { registerSearch } from "./commands/search.js";
import { registerShow } from "./commands/show.js";
import { registerStats } from "./commands/stats.js";
import { registerVerify } from "./commands/verify.js";
import { registerVisualize } from "./commands/visualize.js";

const program = new Command()
  .name("engram")
  .description(
    "A local-first temporal knowledge graph engine for developer memory",
  )
  .version(ENGINE_VERSION);

registerInit(program);
registerAdd(program);
registerSearch(program);
registerShow(program);
registerHistory(program);
registerDecay(program);
registerOwnership(program);
registerStats(program);
registerIngest(program);
registerExport(program);
registerVerify(program);
registerMaintenance(program);
registerReconcile(program);
registerVisualize(program);

program.parse();
