import { describe, expect, test } from "@jest/globals";
import { emitItems } from "@/generators/framework";
import { SUBTEST1_GENERATORS } from "@/generators/subtest1";
import { SUBTEST2_GENERATORS } from "@/generators/subtest2";
import { DOMAINS, SUBDOMAINS } from "@/content/smr";

const ALL = [...SUBTEST1_GENERATORS, ...SUBTEST2_GENERATORS];

describe("generator invariants", () => {
  test.each(ALL.map((d) => [d.id, d] as const))("%s emits valid, deterministic items", (_id, def) => {
    const items = emitItems(def);
    expect(items).toHaveLength(def.variants);

    for (const item of items) {
      // 4 distinct, non-empty choices with a valid key
      expect(item.choices).toHaveLength(4);
      expect(new Set(item.choices.map((c) => c.trim())).size).toBe(4);
      for (const c of item.choices) expect(c.trim().length).toBeGreaterThan(0);
      expect(item.key).toBeGreaterThanOrEqual(0);
      expect(item.key).toBeLessThan(4);

      expect(item.stem.trim().length).toBeGreaterThan(10);
      expect(item.workedSolution.trim().length).toBeGreaterThan(10);

      // metadata consistency with the SMR map
      expect(item.subtest).toBe(def.subtest);
      expect(SUBDOMAINS[item.subdomain].domain).toBe(item.domain);
      expect(DOMAINS[item.domain].subtest).toBe(item.subtest);

      // balanced $ delimiters so KaTeX rendering can't leak
      expect(count(item.stem, "$") % 2).toBe(0);
      expect(count(item.workedSolution, "$") % 2).toBe(0);
      for (const c of item.choices) expect(count(c, "$") % 2).toBe(0);
    }

    // deterministic: same generator, same output
    expect(emitItems(def)).toEqual(items);
  });

  test("no duplicate item IDs across all generators", () => {
    const ids = ALL.flatMap((d) => emitItems(d).map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}
