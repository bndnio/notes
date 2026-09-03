import type { Content, Env, Profile } from "./types";

export type SinkResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string };

export interface SinkContext {
  env: Env;
  profile: Profile;
  artifacts?: { rawEmail?: string };
}

export interface Sink {
  id: string;
  enabled(profile: Profile): boolean;
  write(content: Content, ctx: SinkContext): Promise<SinkResult>;
}
