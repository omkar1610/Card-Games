// Standard contract-bridge deal scoring (as used in Chicago), with a plain-English breakdown.
import type { Contract } from "./engine";

export interface ScoreResult {
  made: boolean;
  /** Tricks over (+) or under (−) the contract. */
  overUnder: number;
  /** Points scored this deal, by the declaring side if made, otherwise by the defenders. */
  points: number;
  breakdown: string[];
}

const perTrick = (strain: Contract["strain"]) => (strain === "C" || strain === "D" ? 20 : 30);

export function scoreDeal(c: Contract, tricksWon: number, vulnerable: boolean): ScoreResult {
  const needed = 6 + c.level;
  const diff = tricksWon - needed;
  const mult = c.doubled === 2 ? 4 : c.doubled === 1 ? 2 : 1;
  const lines: string[] = [];

  if (diff >= 0) {
    // Contract points: 20 per minor trick, 30 per major, NT 40 for the first then 30.
    const base = c.strain === "NT" ? 40 + (c.level - 1) * 30 : c.level * perTrick(c.strain);
    const trickScore = base * mult;
    let total = trickScore;
    lines.push(`${c.level} contract trick${c.level > 1 ? "s" : ""}${mult > 1 ? ` ×${mult}` : ""}: ${trickScore}`);

    if (trickScore >= 100) {
      const g = vulnerable ? 500 : 300;
      total += g;
      lines.push(`Game bonus${vulnerable ? " (vulnerable)" : ""}: ${g}`);
    } else {
      total += 50;
      lines.push("Part-score bonus: 50");
    }
    if (c.level === 6) {
      const s = vulnerable ? 750 : 500;
      total += s;
      lines.push(`Small slam bonus: ${s}`);
    } else if (c.level === 7) {
      const s = vulnerable ? 1500 : 1000;
      total += s;
      lines.push(`Grand slam bonus: ${s}`);
    }
    if (c.doubled) {
      const ins = c.doubled === 2 ? 100 : 50;
      total += ins;
      lines.push(`Making a ${c.doubled === 2 ? "redoubled" : "doubled"} contract: ${ins}`);
    }
    if (diff > 0) {
      const each = c.doubled ? (vulnerable ? 200 : 100) * (c.doubled === 2 ? 2 : 1) : perTrick(c.strain);
      total += diff * each;
      lines.push(`${diff} overtrick${diff > 1 ? "s" : ""} × ${each}: ${diff * each}`);
    }
    return { made: true, overUnder: diff, points: total, breakdown: lines };
  }

  // Defeated: penalty to the defenders.
  const down = -diff;
  let pen = 0;
  if (!c.doubled) {
    pen = down * (vulnerable ? 100 : 50);
    lines.push(`${down} undertrick${down > 1 ? "s" : ""} × ${vulnerable ? 100 : 50}: ${pen}`);
  } else {
    for (let i = 1; i <= down; i++) {
      pen += vulnerable ? (i === 1 ? 200 : 300) : i === 1 ? 100 : i <= 3 ? 200 : 300;
    }
    if (c.doubled === 2) pen *= 2;
    lines.push(`${down} undertrick${down > 1 ? "s" : ""}, ${c.doubled === 2 ? "redoubled" : "doubled"}${vulnerable ? ", vulnerable" : ""}: ${pen}`);
  }
  return { made: false, overUnder: diff, points: pen, breakdown: lines };
}
