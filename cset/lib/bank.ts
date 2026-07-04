import type { CRItem, Item, MCItem, Subtest } from "./types";
import generated from "@/content/questions/generated.json";
import curatedS1 from "@/content/questions/curated-s1.json";
import curatedS2 from "@/content/questions/curated-s2.json";
import curatedHard from "@/content/questions/curated-hard.json";
import crS1 from "@/content/cr/cr-s1.json";
import crS2 from "@/content/cr/cr-s2.json";

export const MC_BANK: MCItem[] = [
  ...(generated as MCItem[]),
  ...(curatedS1 as MCItem[]),
  ...(curatedS2 as MCItem[]),
  ...(curatedHard as MCItem[]),
];

export const CR_BANK: CRItem[] = [...(crS1 as CRItem[]), ...(crS2 as CRItem[])];

const byId = new Map<string, Item>();
for (const item of MC_BANK) byId.set(item.id, item);
for (const item of CR_BANK) byId.set(item.id, item);

export function getItem(id: string): Item | undefined {
  return byId.get(id);
}

export function mcForSubtest(subtest: Subtest): MCItem[] {
  return MC_BANK.filter((i) => i.subtest === subtest);
}

export function crForSubtest(subtest: Subtest): CRItem[] {
  return CR_BANK.filter((i) => i.subtest === subtest);
}
