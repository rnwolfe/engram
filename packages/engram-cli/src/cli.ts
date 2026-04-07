#!/usr/bin/env node

import { Command } from "commander";
import { ENGINE_VERSION } from "engram-core";

const program = new Command()
  .name("engram")
  .description(
    "A local-first temporal knowledge graph engine for developer memory",
  )
  .version(ENGINE_VERSION);

program.parse();
