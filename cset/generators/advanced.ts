import type { GeneratorDef } from "./framework";
import { fracTex, gcdInt, polyTex } from "./framework";
import { choice, randInt, type RNG } from "@/lib/rng";

/**
 * Harder generators (1300-1450) targeting the multi-step, conceptual end
 * of the exam — the questions that separate a pass from an ace.
 */

// ---------- Subtest I ----------

const modInverse: GeneratorDef = {
  id: "s1-mod-inverse",
  subtest: 1,
  domain: "1",
  subdomain: "1.2",
  baseDifficulty: 1350,
  variants: 6,
  generate(rng: RNG) {
    const m = choice(rng, [7, 9, 11, 13]);
    let a = randInt(rng, 2, m - 2);
    while (gcdInt(a, m) !== 1) a = randInt(rng, 2, m - 2);
    let inv = 0;
    for (let x = 1; x < m; x++) {
      if ((a * x) % m === 1) {
        inv = x;
        break;
      }
    }
    const cands = [m - inv, a, (inv + 1) % m || 1, (inv + 2) % m || 2, (m + 1 - a) % m || 1];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c >= 1 && c < m && c !== inv && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the multiplicative inverse of $${a}$ in $\\mathbb{Z}_{${m}}$ (that is, the $x$ with $${a}x \\equiv 1 \\pmod{${m}}$)?`,
      correct: `$${inv}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `Search for $x$ with $${a}x \\equiv 1 \\pmod{${m}}$: $${a} \\cdot ${inv} = ${a * inv} = ${Math.floor((a * inv) / m)} \\cdot ${m} + 1$, so $x = ${inv}$. The inverse exists because $\\gcd(${a}, ${m}) = 1$. (Note $${m - inv}$ is the inverse of $-${a}$, i.e. the additive-style sign error.)`,
    };
  },
};

const demoivreRoot: GeneratorDef = {
  id: "s1-demoivre-root",
  subtest: 1,
  domain: "1",
  subdomain: "1.1",
  baseDifficulty: 1400,
  variants: 6,
  generate(rng: RNG) {
    const c = randInt(rng, 2, 3);
    const r = c * c * c;
    const theta = choice(rng, [30, 60, 90, 120, 150]);
    const k = randInt(rng, 0, 2);
    const ang = (theta / 3 + 120 * k) % 360;
    const cis = (rr: number, t: number) => `$${rr === 1 ? "" : rr}\\left(\\cos ${t}^\\circ + i\\sin ${t}^\\circ\\right)$`;
    return {
      stem: `Let $z = ${r}\\left(\\cos ${theta}^\\circ + i\\sin ${theta}^\\circ\\right)$. Which of the following is a cube root of $z$?`,
      correct: cis(c, ang),
      distractors: [
        cis(r, theta / 3), // forgot to take the cube root of the modulus
        cis(c, (theta / 3 + 60) % 360), // wrong spacing between roots (should be 120°)
        cis(c, (3 * theta) % 360), // multiplied the angle instead of dividing
      ],
      solution: `The cube roots of $r(\\cos\\theta + i\\sin\\theta)$ are $\\sqrt[3]{r}\\left(\\cos\\frac{\\theta + 360^\\circ k}{3} + i\\sin\\frac{\\theta + 360^\\circ k}{3}\\right)$ for $k = 0, 1, 2$. Here $\\sqrt[3]{${r}} = ${c}$ and the angles are $${theta / 3}^\\circ, ${theta / 3 + 120}^\\circ, ${theta / 3 + 240}^\\circ$ — spaced $120^\\circ$ apart. The choice with modulus $${c}$ and angle $${ang}^\\circ$ (the $k = ${k}$ root) is correct. Verify: cubing it gives modulus $${c}^3 = ${r}$ and angle $3 \\cdot ${ang}^\\circ \\equiv ${theta}^\\circ \\pmod{360^\\circ}$.`,
    };
  },
};

const vietaCubic: GeneratorDef = {
  id: "s1-vieta-cubic",
  subtest: 1,
  domain: "2",
  subdomain: "2.2",
  baseDifficulty: 1350,
  variants: 6,
  generate(rng: RNG) {
    const a = randInt(rng, 2, 5);
    const b = randInt(rng, 1, 9) * (rng() < 0.5 ? -1 : 1);
    const cc = randInt(rng, 1, 9) * (rng() < 0.5 ? -1 : 1);
    const d = randInt(rng, 1, 9) * (rng() < 0.5 ? -1 : 1);
    const ask = choice(rng, ["sum", "product"] as const);
    const correct = ask === "sum" ? fracTex(-b, a) : fracTex(-d, a);
    const cands =
      ask === "sum"
        ? [fracTex(b, a), fracTex(-d, a), fracTex(cc, a), fracTex(d, a)]
        : [fracTex(d, a), fracTex(-b, a), fracTex(cc, a), fracTex(b, a)];
    const distractors: string[] = [];
    for (const s of cands) {
      if (s !== correct && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `Over $\\mathbb{C}$, counted with multiplicity, what is the ${ask} of the roots of $${polyTex([a, b, cc, d])} = 0$?`,
      correct: `$${correct}$`,
      distractors: distractors.map((s) => `$${s}$`),
      solution: `For $ax^3 + bx^2 + cx + d = 0$, Vieta's formulas give: sum of roots $= -\\frac{b}{a}$, sum of pairwise products $= \\frac{c}{a}$, product of roots $= -\\frac{d}{a}$ (the sign alternates with degree — for cubics the product carries a minus). Here the ${ask} is $${correct}$.`,
    };
  },
};

const LOG_SETUPS: Array<{ b: number; m: number; r: number; s: number }> = [
  { b: 2, m: 3, r: 8, s: 1 },
  { b: 2, m: 3, r: 4, s: 2 },
  { b: 2, m: 2, r: 4, s: 1 },
  { b: 3, m: 2, r: 9, s: 1 },
  { b: 2, m: 4, r: 16, s: 1 },
  { b: 2, m: 4, r: 8, s: 2 },
  { b: 3, m: 3, r: 27, s: 1 },
  { b: 3, m: 3, r: 9, s: 3 },
];

const logEquation: GeneratorDef = {
  id: "s1-log-equation",
  subtest: 1,
  domain: "2",
  subdomain: "2.3",
  baseDifficulty: 1400,
  variants: 6,
  generate(rng: RNG) {
    const { b, m, r, s } = choice(rng, LOG_SETUPS);
    const k = r - s; // x^2 - kx - rs = 0 has roots r and -s
    const N = b ** m; // = r*s
    return {
      stem: `Consider the equation $\\log_{${b}}(x) + \\log_{${b}}(x - ${k}) = ${m}$. What is its solution set?`,
      correct: `$\\{${r}\\}$`,
      distractors: [`$\\{${r},\\ -${s}\\}$`, `$\\{-${s}\\}$`, `$\\{${N}\\}$`],
      solution: `Combine: $\\log_{${b}}[x(x - ${k})] = ${m}$, so $x(x - ${k}) = ${b}^{${m}} = ${N}$, giving $x^2 - ${k}x - ${N} = 0 = (x - ${r})(x + ${s})$. The candidates are $x = ${r}$ and $x = -${s}$. But the original equation requires $x > 0$ AND $x > ${k}$ (both log arguments positive); $x = -${s}$ makes $\\log_{${b}}(x)$ undefined, so it is extraneous. The solution set is $\\{${r}\\}$. Check: $\\log_{${b}}${r} + \\log_{${b}}${r - k} = \\log_{${b}}(${r} \\cdot ${r - k}) = \\log_{${b}}${N} = ${m}$. ✓`,
    };
  },
};

interface NamedMatrix {
  name: string;
  m: [number, number, number, number]; // row-major a b c d
}

const PLANE_TRANSFORMS: NamedMatrix[] = [
  { name: "rotation by $90^\\circ$ counterclockwise", m: [0, -1, 1, 0] },
  { name: "rotation by $90^\\circ$ clockwise", m: [0, 1, -1, 0] },
  { name: "rotation by $180^\\circ$", m: [-1, 0, 0, -1] },
  { name: "reflection across the $x$-axis", m: [1, 0, 0, -1] },
  { name: "reflection across the $y$-axis", m: [-1, 0, 0, 1] },
  { name: "reflection across the line $y = x$", m: [0, 1, 1, 0] },
];

function matMul(A: [number, number, number, number], B: [number, number, number, number]): [number, number, number, number] {
  return [
    A[0] * B[0] + A[1] * B[2],
    A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2],
    A[2] * B[1] + A[3] * B[3],
  ];
}

function pmat(m: [number, number, number, number]): string {
  return `$\\begin{pmatrix} ${m[0]} & ${m[1]} \\\\ ${m[2]} & ${m[3]} \\end{pmatrix}$`;
}

const matrixCompose: GeneratorDef = {
  id: "s1-matrix-compose",
  subtest: 1,
  domain: "2",
  subdomain: "2.4",
  baseDifficulty: 1400,
  variants: 6,
  generate(rng: RNG) {
    const i = randInt(rng, 0, PLANE_TRANSFORMS.length - 1);
    let j = randInt(rng, 0, PLANE_TRANSFORMS.length - 1);
    if (j === i) j = (j + 1) % PLANE_TRANSFORMS.length;
    const T1 = PLANE_TRANSFORMS[i]; // applied first
    const T2 = PLANE_TRANSFORMS[j]; // applied second
    const correct = matMul(T2.m, T1.m);
    const wrongOrder = matMul(T1.m, T2.m);
    return {
      stem: `A figure in the plane undergoes ${T1.name}, followed by ${T2.name}. Which single matrix represents the composite transformation (acting on column vectors)?`,
      correct: pmat(correct),
      distractors: [pmat(wrongOrder), pmat(T2.m), pmat(T1.m)],
      solution: `Applying $T_1$ then $T_2$ to a column vector $\\mathbf{v}$ gives $T_2(T_1\\mathbf{v}) = (M_{2}M_{1})\\mathbf{v}$ — the matrix applied FIRST sits on the RIGHT. With $M_1 = ${pmat(T1.m).slice(1, -1)}$ and $M_2 = ${pmat(T2.m).slice(1, -1)}$, the product $M_2 M_1 = ${pmat(correct).slice(1, -1)}$. Multiplying in the wrong order gives $${pmat(wrongOrder).slice(1, -1)}$${JSON.stringify(correct) === JSON.stringify(wrongOrder) ? " (these happen to commute, but in general they do not)" : ", a different transformation — matrix multiplication is not commutative"}.`,
    };
  },
};

// ---------- Subtest II ----------

const arcSector: GeneratorDef = {
  id: "s2-arc-sector",
  subtest: 2,
  domain: "3",
  subdomain: "3.1",
  baseDifficulty: 1300,
  variants: 6,
  generate(rng: RNG) {
    const theta = choice(rng, [30, 45, 60, 90, 120]);
    const r = choice(rng, [4, 6, 8, 12]);
    const coef = (n: number, d: number) => {
      const f = fracTex(n, d);
      return f === "1" ? "\\pi" : `${f}\\pi`;
    };
    const correct = coef(theta * r * r, 360);
    const cands = [coef(theta * 2 * r, 360), `${r * r}\\pi`, coef(theta * r * r, 180), coef(theta * r, 360)];
    const distractors: string[] = [];
    for (const s of cands) {
      if (s !== correct && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `A circle has radius $${r}$. What is the area of the sector determined by a central angle of $${theta}^\\circ$?`,
      correct: `$${correct}$`,
      distractors: distractors.map((s) => `$${s}$`),
      solution: `A sector is the fraction $\\frac{${theta}}{360}$ of the full circle's area: $\\frac{${theta}}{360} \\cdot \\pi (${r})^2 = \\frac{${theta}}{360} \\cdot ${r * r}\\pi = ${correct}$. Don't confuse this with the ARC LENGTH $\\frac{${theta}}{360} \\cdot 2\\pi r = ${coef(theta * 2 * r, 360)}$.`,
    };
  },
};

const similarProportion: GeneratorDef = {
  id: "s2-similar-proportion",
  subtest: 2,
  domain: "3",
  subdomain: "3.1",
  baseDifficulty: 1300,
  variants: 6,
  generate(rng: RNG) {
    const a = randInt(rng, 2, 5); // AD
    const b = randInt(rng, 2, 6); // DB
    const t = randInt(rng, 2, 4);
    const ae = a * t;
    const ec = b * t;
    const cands = [`$${fracTex(a * a * t, b)}$`, `$${b}$`, `$${a * t + b}$`, `$${a * t}$`];
    const correct = `$${ec}$`;
    const distractors: string[] = [];
    for (const s of cands) {
      if (s !== correct && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `In triangle $ABC$, points $D$ and $E$ lie on sides $AB$ and $AC$ respectively, with $\\overline{DE} \\parallel \\overline{BC}$. If $AD = ${a}$, $DB = ${b}$, and $AE = ${ae}$, what is $EC$?`,
      correct,
      distractors,
      solution: `Because $DE \\parallel BC$, the Triangle Proportionality (Basic Proportionality) Theorem gives $\\frac{AD}{DB} = \\frac{AE}{EC}$. So $EC = AE \\cdot \\frac{DB}{AD} = ${ae} \\cdot \\frac{${b}}{${a}} = ${ec}$. Check the ratio: $\\frac{${a}}{${b}} = \\frac{${ae}}{${ec}}$. ✓`,
    };
  },
};

const condProbTable: GeneratorDef = {
  id: "s2-cond-prob-table",
  subtest: 2,
  domain: "4",
  subdomain: "4.1",
  baseDifficulty: 1400,
  variants: 6,
  generate(rng: RNG) {
    const my = 5 * randInt(rng, 2, 8);
    const mn = 5 * randInt(rng, 2, 8);
    const fy = 5 * randInt(rng, 2, 8);
    const fn = 5 * randInt(rng, 2, 8);
    const total = my + mn + fy + fn;
    const correct = fracTex(fy, fy + fn);
    const cands = [fracTex(fy, total), fracTex(fy, my + fy), fracTex(fy + fn, total), fracTex(fn, fy + fn)];
    const distractors: string[] = [];
    for (const s of cands) {
      if (s !== correct && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `A survey of $${total}$ adults produced the following results.\n\n$$\\begin{array}{c|cc} & \\text{Supports} & \\text{Opposes} \\\\ \\hline \\text{Men} & ${my} & ${mn} \\\\ \\text{Women} & ${fy} & ${fn} \\end{array}$$\n\nIf one surveyed person is selected at random and is known to be a woman, what is the probability that she supports the measure?`,
      correct: `$${correct}$`,
      distractors: distractors.map((s) => `$${s}$`),
      solution: `This is conditional probability: restrict the sample space to the $${fy + fn}$ women. $P(\\text{supports} \\mid \\text{woman}) = \\frac{${fy}}{${fy} + ${fn}} = ${correct}$. Using the whole table's total $${total}$ instead gives the JOINT probability $P(\\text{woman and supports}) = ${fracTex(fy, total)}$ — a different question.`,
    };
  },
};

interface NormalSlice {
  desc: (lo: string, hi: string, mu: number, sig: number) => string;
  pct: number;
}

const SLICES: NormalSlice[] = [
  { desc: (lo, hi) => `between $${lo}$ and $${hi}$`, pct: 13.5 }, // μ+σ to μ+2σ
  { desc: (lo) => `greater than $${lo}$`, pct: 16 }, // above μ+σ
  { desc: (lo) => `less than $${lo}$`, pct: 2.5 }, // below μ-2σ
  { desc: (lo, hi) => `between $${lo}$ and $${hi}$`, pct: 47.5 }, // μ to μ+2σ
  { desc: (lo, hi) => `between $${lo}$ and $${hi}$`, pct: 81.5 }, // μ-σ to μ+2σ
];

const normalSlices: GeneratorDef = {
  id: "s2-normal-slices",
  subtest: 2,
  domain: "4",
  subdomain: "4.2",
  baseDifficulty: 1350,
  variants: 6,
  generate(rng: RNG) {
    const mu = 10 * randInt(rng, 5, 9);
    const sig = choice(rng, [5, 10, 15]);
    const which = randInt(rng, 0, SLICES.length - 1);
    const bounds: Array<[number, number]> = [
      [mu + sig, mu + 2 * sig],
      [mu + sig, NaN],
      [mu - 2 * sig, NaN],
      [mu, mu + 2 * sig],
      [mu - sig, mu + 2 * sig],
    ];
    const [lo, hi] = bounds[which];
    const slice = SLICES[which];
    const region = slice.desc(`${lo}`, `${hi}`, mu, sig);
    const others = [2.5, 5, 13.5, 16, 34, 47.5, 68, 81.5, 84, 95].filter((p) => p !== slice.pct);
    const distractors: string[] = [];
    while (distractors.length < 3) {
      const p = others.splice(Math.floor(rng() * others.length), 1)[0];
      distractors.push(`About $${p}\\%$`);
    }
    return {
      stem: `A quantity is approximately normally distributed with mean $${mu}$ and standard deviation $${sig}$. Using the empirical rule (68–95–99.7), approximately what percent of values are ${region}?`,
      correct: `About $${slice.pct}\\%$`,
      distractors,
      solution: `Convert the bounds to standard deviations from the mean, then slice the empirical-rule percentages symmetrically: $68\\%$ lies within $1\\sigma$ (so $34\\%$ per side), $95\\%$ within $2\\sigma$ (so $47.5\\%$ per side), and each tail beyond $2\\sigma$ holds $\\frac{100 - 95}{2} = 2.5\\%$. Assembling the requested region gives about $${slice.pct}\\%$.`,
    };
  },
};

const compositeSolid: GeneratorDef = {
  id: "s2-composite-solid",
  subtest: 2,
  domain: "3",
  subdomain: "3.3",
  baseDifficulty: 1350,
  variants: 6,
  generate(rng: RNG) {
    const r = choice(rng, [3, 6]);
    const h = randInt(rng, 4, 10);
    const cyl = r * r * h;
    const hemi = (2 * r * r * r) / 3; // integer for r ∈ {3, 6}
    const correct = `$${cyl + hemi}\\pi$`;
    const cands = [`$${cyl + 2 * hemi}\\pi$`, `$${cyl}\\pi$`, `$${cyl + hemi / 2}\\pi$`, `$${cyl + 2 * hemi + 1}\\pi$`];
    const distractors: string[] = [];
    for (const s of cands) {
      if (s !== correct && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `A grain silo is shaped like a right circular cylinder of radius $${r}$ and height $${h}$, topped by a hemisphere of the same radius. What is the total volume of the silo?`,
      correct,
      distractors,
      solution: `Volume $=$ cylinder $+$ hemisphere $= \\pi r^2 h + \\frac{1}{2} \\cdot \\frac{4}{3}\\pi r^3 = \\pi (${r})^2 (${h}) + \\frac{2}{3}\\pi (${r})^3 = ${cyl}\\pi + ${hemi}\\pi = ${cyl + hemi}\\pi$. Adding a FULL sphere by mistake gives $${cyl + 2 * hemi}\\pi$.`,
    };
  },
};

export const ADVANCED_GENERATORS: GeneratorDef[] = [
  modInverse,
  demoivreRoot,
  vietaCubic,
  logEquation,
  matrixCompose,
  arcSector,
  similarProportion,
  condProbTable,
  normalSlices,
  compositeSolid,
];
