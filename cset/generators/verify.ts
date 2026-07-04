import { readFileSync } from "fs";
import { join } from "path";
import { DOMAINS, SUBDOMAINS } from "@/content/smr";
import type { CRItem, MCItem } from "@/lib/types";

/**
 * Structural verification of the full content bank (generated + curated + CR).
 * Run with: npm run verify
 * Catches: duplicate IDs, malformed choices, out-of-range keys, SMR
 * inconsistencies, unbalanced $ math delimiters, missing solutions.
 */

let failures = 0;

function fail(id: string, msg: string) {
  failures++;
  console.error(`  ✗ ${id}: ${msg}`);
}

function checkTexBalance(id: string, field: string, text: string) {
  if ((text.split("$").length - 1) % 2 !== 0) fail(id, `unbalanced $ delimiters in ${field}`);
}

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(__dirname, "..", rel), "utf8")) as T;
}

const mc: MCItem[] = [
  ...loadJson<MCItem[]>("content/questions/generated.json"),
  ...loadJson<MCItem[]>("content/questions/curated-s1.json"),
  ...loadJson<MCItem[]>("content/questions/curated-s2.json"),
  ...loadJson<MCItem[]>("content/questions/curated-hard.json"),
];
const cr: CRItem[] = [...loadJson<CRItem[]>("content/cr/cr-s1.json"), ...loadJson<CRItem[]>("content/cr/cr-s2.json")];

const seen = new Set<string>();
for (const item of [...mc, ...cr]) {
  if (seen.has(item.id)) fail(item.id, "duplicate ID");
  seen.add(item.id);
  const sub = SUBDOMAINS[item.subdomain];
  if (!sub) {
    fail(item.id, `unknown subdomain ${item.subdomain}`);
    continue;
  }
  if (sub.domain !== item.domain) fail(item.id, `subdomain ${item.subdomain} is not in domain ${item.domain}`);
  if (DOMAINS[item.domain].subtest !== item.subtest) fail(item.id, `domain ${item.domain} is not on subtest ${item.subtest}`);
  if (item.difficulty < 800 || item.difficulty > 1700) fail(item.id, `implausible difficulty ${item.difficulty}`);
  checkTexBalance(item.id, "stem", item.stem);
}

for (const item of mc) {
  if (item.type !== "mc") fail(item.id, "type must be 'mc'");
  if (!Array.isArray(item.choices) || item.choices.length !== 4) fail(item.id, "must have exactly 4 choices");
  else {
    if (new Set(item.choices.map((c) => c.trim())).size !== 4) fail(item.id, "choices are not distinct");
    for (const c of item.choices) checkTexBalance(item.id, "choice", c);
  }
  if (!Number.isInteger(item.key) || item.key < 0 || item.key > 3) fail(item.id, `bad key ${item.key}`);
  if (!item.workedSolution || item.workedSolution.trim().length < 10) fail(item.id, "missing worked solution");
  else checkTexBalance(item.id, "workedSolution", item.workedSolution);
}

for (const item of cr) {
  if (item.type !== "cr") fail(item.id, "type must be 'cr'");
  if (!item.modelAnswer || item.modelAnswer.trim().length < 100) fail(item.id, "model answer missing or too thin");
}

const s1 = mc.filter((i) => i.subtest === 1).length;
const s2 = mc.filter((i) => i.subtest === 2).length;
console.log(`Checked ${mc.length} MC items (${s1} subtest I, ${s2} subtest II) and ${cr.length} CR items.`);

if (failures > 0) {
  console.error(`${failures} problem(s) found.`);
  process.exit(1);
}
console.log("All checks passed.");
