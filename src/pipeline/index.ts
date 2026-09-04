import { sinks } from "./sinks";
import type { SinkContext, SinkResult } from "./sinks/types";
import type { Content, Env, Profile } from "@/lib/types";

export type SaveNoteResult = Record<string, SinkResult>;

export function hasEnabledSink(profile: Profile): boolean {
  return sinks.some((sink) => sink.enabled(profile));
}

export async function saveNote(
  content: Content,
  env: Env,
  profile: Profile,
  artifacts?: { rawEmail?: string },
): Promise<SaveNoteResult> {
  const ctx: SinkContext = { env, profile, artifacts };
  const enabled = sinks.filter((sink) => sink.enabled(profile));
  const settled = await Promise.allSettled(enabled.map((sink) => sink.write(content, ctx)));

  const results: SaveNoteResult = {};
  for (let i = 0; i < enabled.length; i++) {
    const sink = enabled[i];
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      results[sink.id] = outcome.value;
    } else {
      results[sink.id] = {
        ok: false,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      };
    }
  }
  return results;
}
