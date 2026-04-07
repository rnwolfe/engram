/**
 * engram MCP server — stdio transport for Claude Code and Cursor integration.
 *
 * Read-heavy, evidence-based write surface over the engram knowledge graph.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { closeGraph, openGraph } from "engram-core";
import {
  ENGRAM_RESOURCES,
  readRecentEpisodes,
  readStats,
} from "./resources.js";
import {
  GET_CONTEXT_TOOL,
  type GetContextInput,
  handleGetContext,
} from "./tools/context.js";
import {
  GET_DECAY_TOOL,
  type GetDecayInput,
  handleGetDecay,
} from "./tools/decay.js";
import {
  ADD_ENTITY_TOOL,
  type AddEntityInput,
  GET_ENTITY_TOOL,
  type GetEntityInput,
  handleAddEntity,
  handleGetEntity,
} from "./tools/entity.js";
import {
  GET_HISTORY_TOOL,
  type GetHistoryInput,
  handleGetHistory,
} from "./tools/history.js";
import { handleSearch, SEARCH_TOOL, type SearchInput } from "./tools/search.js";
import {
  ADD_EDGE_TOOL,
  ADD_EPISODE_TOOL,
  type AddEdgeInput,
  type AddEpisodeInput,
  handleAddEdge,
  handleAddEpisode,
} from "./tools/write.js";

export const MCP_SERVER_NAME = "engram";

const ALL_TOOLS = [
  SEARCH_TOOL,
  GET_ENTITY_TOOL,
  GET_CONTEXT_TOOL,
  GET_DECAY_TOOL,
  GET_HISTORY_TOOL,
  ADD_EPISODE_TOOL,
  ADD_ENTITY_TOOL,
  ADD_EDGE_TOOL,
];

/**
 * Creates and configures the engram MCP server.
 * Does not connect to transport — call server.connect(transport) to start.
 */
export function createServer(dbPath: string) {
  const graph = openGraph(dbPath);

  const server = new Server(
    { name: MCP_SERVER_NAME, version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ---------------------------------------------------------------------------
  // Tool handlers
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: ALL_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {}) as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {
        case "engram_search":
          result = handleSearch(graph, input as SearchInput);
          break;
        case "engram_get_entity":
          result = handleGetEntity(graph, input as GetEntityInput);
          break;
        case "engram_get_context":
          result = handleGetContext(graph, input as GetContextInput);
          break;
        case "engram_get_decay":
          result = handleGetDecay(graph, input as GetDecayInput);
          break;
        case "engram_get_history":
          result = handleGetHistory(graph, input as GetHistoryInput);
          break;
        case "engram_add_episode":
          result = handleAddEpisode(graph, input as AddEpisodeInput);
          break;
        case "engram_add_entity":
          result = handleAddEntity(graph, input as AddEntityInput);
          break;
        case "engram_add_edge":
          result = handleAddEdge(graph, input as AddEdgeInput);
          break;
        default:
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  });

  // ---------------------------------------------------------------------------
  // Resource handlers
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: ENGRAM_RESOURCES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params;

    switch (uri) {
      case "engram://stats": {
        const stats = readStats(graph);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(stats),
            },
          ],
        };
      }
      case "engram://recent": {
        const recent = readRecentEpisodes(graph);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(recent),
            },
          ],
        };
      }
      default:
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: `Unknown resource: ${uri}`,
            },
          ],
        };
    }
  });

  return { server, graph };
}

/**
 * Main entrypoint: open the graph, connect to stdio transport.
 */
async function main() {
  const dbPath = process.env.ENGRAM_DB ?? ".engram";
  const { server, graph } = createServer(dbPath);
  const transport = new StdioServerTransport();

  const shutdown = () => {
    try {
      closeGraph(graph);
    } catch {
      // ignore close errors during shutdown
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("engram-mcp: fatal error:", err);
    process.exit(1);
  });
}
