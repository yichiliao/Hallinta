import "server-only";
import path from "node:path";
import { LocalProjectStore } from "./local";
import type { ProjectStore } from "./types";

export * from "./types";

/** Folder holding project data (and, in team mode, `.hallinta/` account data). */
export function dataRoot(): string {
  // The data directory is chosen at runtime; keep the bundler from tracing it.
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.HALLINTA_DATA_DIR ?? path.join(process.cwd(), "data"),
  );
}

let store: ProjectStore | undefined;

export function getStore(): ProjectStore {
  store ??= new LocalProjectStore(dataRoot());
  return store;
}
