/**
 * sample-js plugin fixture — minimal js-module adapter for testing.
 * Declares supportedAuth, enrich (no-op), and scopeSchema.
 */

const adapter = {
  supportedAuth: ["none"],

  scopeSchema: {
    description: "No scope required for sample-js plugin",
    pattern: ".*",
  },

  async enrich(
    _graph: unknown,
    _opts: unknown,
  ): Promise<{
    episodesCreated: number;
    episodesSkipped: number;
    entitiesCreated: number;
    edgesCreated: number;
    edgesSuperseded: number;
  }> {
    return {
      episodesCreated: 0,
      episodesSkipped: 0,
      entitiesCreated: 0,
      edgesCreated: 0,
      edgesSuperseded: 0,
    };
  },
};

export default adapter;
