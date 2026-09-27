import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after } from "node:test";
import { LocalProjectStore } from "@/lib/store/local";

export const EXAMPLES = path.join(import.meta.dirname, "..", "examples");

export function readExample(file: string): string {
  return readFileSync(path.join(EXAMPLES, file), "utf8");
}

/** A LocalProjectStore over a throwaway copy of examples/, removed after the test file. */
export function exampleStore(): { store: LocalProjectStore; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "hallinta-test-"));
  cpSync(EXAMPLES, root, { recursive: true });
  after(() => rmSync(root, { recursive: true, force: true }));
  return { store: new LocalProjectStore(root), root };
}
