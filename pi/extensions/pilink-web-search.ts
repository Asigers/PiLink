import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSearchResults, searchWeb } from "../../src/tools/brave-search.ts";

export default function registerPiLinkTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "search_web",
    label: "Web Search",
    description: "Search the public web using Brave Search. Use for current facts, research, documentation discovery, and cross-checking claims. Inspect important sources before drawing conclusions.",
    parameters: Type.Object({
      query: Type.String({ minLength: 2, description: "Search query in the most useful language for the subject." }),
      count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Number of results. Defaults to 8." })),
      country: Type.Optional(Type.String({ description: "Two-letter country code such as US or CN." })),
      freshness: Type.Optional(Type.Union([
        Type.Literal("day"),
        Type.Literal("week"),
        Type.Literal("month"),
        Type.Literal("year")
      ]))
    }),
    execute: async (_toolCallId, params) => {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Web search is unavailable: configure BRAVE_SEARCH_API_KEY in PiLink's environment." }],
          isError: true
        };
      }
      try {
        const results = await searchWeb({
          apiKey,
          query: params.query,
          count: params.count,
          country: params.country,
          freshness: params.freshness
        });
        return { content: [{ type: "text", text: formatSearchResults(results) }], isError: false };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true
        };
      }
    }
  });
}
