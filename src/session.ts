import { z } from "zod";
import { CATALOG } from "./catalog.ts";
import { describeError } from "./http.ts";
import { KEYED_TOOLS } from "./keyed.ts";
import { KEYLESS_TOOLS } from "./keyless.ts";
import type { Catalog, Known, Sources, ToolDef } from "./types.ts";

export const ALL_TOOLS: ToolDef[] = [...KEYLESS_TOOLS, ...KEYED_TOOLS];

// one per client connection, so the mints a search returned stay scoped to that client
export class Session {
  readonly known = new Map<string, Known>();
  readonly sources: Sources;
  readonly catalog: Catalog;

  constructor(sources: Sources, catalog: Catalog = CATALOG) {
    this.sources = sources;
    this.catalog = catalog;
  }

  get hasKey(): boolean {
    return this.sources.search != null && this.sources.risk != null;
  }

  tools(): ToolDef[] {
    return ALL_TOOLS.filter((t) => this.hasKey || !t.keyed);
  }

  keyedSources(): Required<Pick<Sources, "search" | "risk">> {
    const { search, risk } = this.sources;
    if (!search || !risk) throw new Error("needs TOKENS_API_KEY");
    return { search, risk };
  }

  async call(name: string, args: unknown): Promise<unknown> {
    const tool = this.tools().find((t) => t.name === name);
    if (!tool) {
      const needsKey = ALL_TOOLS.some((t) => t.name === name && t.keyed);
      return { error: needsKey ? "this tool needs a TOKENS_API_KEY: use list_tokens, compare_issuers and quote_sizes without one" : `unknown tool ${name}` };
    }
    const parsed = z.object(tool.input).safeParse(args ?? {});
    if (!parsed.success) return { error: `bad arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}` };
    try {
      return await tool.run(this, parsed.data);
    } catch (err) {
      return { error: `source ${describeError(err)}` };
    }
  }
}
