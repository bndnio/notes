import { notionSink } from "./notion";
import { r2Sink } from "./r2";
import type { Sink } from "./types";

export type { Sink, SinkContext, SinkResult } from "./types";
export { notionSink, r2Sink };

export const sinks: Sink[] = [r2Sink, notionSink];
