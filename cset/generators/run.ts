import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { emitItems } from "./framework";
import { ADVANCED_GENERATORS } from "./advanced";
import { SUBTEST1_GENERATORS } from "./subtest1";
import { SUBTEST2_GENERATORS } from "./subtest2";
import type { MCItem } from "@/lib/types";

/**
 * Emits the generated question bank to content/questions/generated.json.
 * Deterministic: rerunning without changing generators produces an
 * identical file, so item IDs (and any flags pointing at them) are stable.
 */

function main() {
  const all: MCItem[] = [];
  const counts: Record<string, number> = {};
  for (const def of [...SUBTEST1_GENERATORS, ...SUBTEST2_GENERATORS, ...ADVANCED_GENERATORS]) {
    const items = emitItems(def);
    counts[def.id] = items.length;
    all.push(...items);
  }
  const ids = new Set(all.map((i) => i.id));
  if (ids.size !== all.length) throw new Error("Duplicate item IDs emitted");

  const outDir = join(__dirname, "..", "content", "questions");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "generated.json");
  writeFileSync(outPath, JSON.stringify(all, null, 1) + "\n");

  const s1 = all.filter((i) => i.subtest === 1).length;
  const s2 = all.filter((i) => i.subtest === 2).length;
  console.log(`Wrote ${all.length} items (${s1} subtest I, ${s2} subtest II) to ${outPath}`);
  for (const [id, n] of Object.entries(counts)) console.log(`  ${id}: ${n}`);
}

main();
