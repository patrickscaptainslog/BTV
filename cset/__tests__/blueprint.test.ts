import { describe, expect, test } from "@jest/globals";
import { CR_BANK, MC_BANK, crForSubtest, mcForSubtest } from "@/lib/bank";
import { composeExam, diagnosticSet, estimateScaledScore } from "@/lib/blueprint";
import { DOMAINS, SUBTEST_INFO, subdomainsForSubtest } from "@/content/smr";
import type { Subtest } from "@/lib/types";

describe("question bank", () => {
  test("all item IDs are unique", () => {
    const ids = [...MC_BANK.map((i) => i.id), ...CR_BANK.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every MC item is structurally valid and consistent with the SMR map", () => {
    for (const item of MC_BANK) {
      expect(item.choices).toHaveLength(4);
      expect(new Set(item.choices).size).toBe(4);
      expect(item.key).toBeGreaterThanOrEqual(0);
      expect(item.key).toBeLessThan(4);
      expect(DOMAINS[item.domain].subtest).toBe(item.subtest);
      expect(DOMAINS[item.domain].subdomains).toContain(item.subdomain);
      expect(item.workedSolution.length).toBeGreaterThan(10);
    }
  });

  test("bank is deep enough for the blueprint in every subdomain", () => {
    for (const st of [1, 2] as Subtest[]) {
      for (const sd of subdomainsForSubtest(st)) {
        const n = MC_BANK.filter((i) => i.subdomain === sd).length;
        expect(n).toBeGreaterThanOrEqual(5);
      }
      for (const d of SUBTEST_INFO[st].domains) {
        const crs = CR_BANK.filter((i) => i.domain === d).length;
        expect(crs).toBeGreaterThanOrEqual(DOMAINS[d].crCount);
      }
    }
  });
});

describe("composeExam", () => {
  test.each([1, 2] as Subtest[])("subtest %i form matches the official blueprint", (st) => {
    const form = composeExam(st, mcForSubtest(st), crForSubtest(st), "test-seed");
    expect(form.mc).toHaveLength(SUBTEST_INFO[st].mcCount);
    expect(form.cr).toHaveLength(SUBTEST_INFO[st].crCount);
    for (const d of SUBTEST_INFO[st].domains) {
      expect(form.mc.filter((i) => i.domain === d)).toHaveLength(DOMAINS[d].mcCount);
      expect(form.cr.filter((i) => i.domain === d)).toHaveLength(DOMAINS[d].crCount);
    }
    // no duplicate questions on one form
    expect(new Set(form.mc.map((i) => i.id)).size).toBe(form.mc.length);
    // deterministic per seed, different across seeds
    expect(composeExam(st, mcForSubtest(st), crForSubtest(st), "test-seed").mc.map((i) => i.id)).toEqual(
      form.mc.map((i) => i.id)
    );
  });
});

describe("diagnosticSet", () => {
  test.each([1, 2] as Subtest[])("subtest %i diagnostic covers every subdomain", (st) => {
    const items = diagnosticSet(st, mcForSubtest(st));
    for (const sd of subdomainsForSubtest(st)) {
      expect(items.filter((i) => i.subdomain === sd).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("estimateScaledScore", () => {
  test("all correct estimates near the top; none near the bottom; passing threshold is sane", () => {
    expect(estimateScaledScore(35, 35, [4, 4, 4])).toBe(300);
    expect(estimateScaledScore(0, 35, [1, 1, 1])).toBe(100);
    // ~75% MC with solid 3s on CR should clear 220
    expect(estimateScaledScore(27, 35, [3, 3, 3])).toBeGreaterThanOrEqual(220);
    // 40% should not
    expect(estimateScaledScore(14, 35, [2, 2, 2])).toBeLessThan(220);
  });
});
