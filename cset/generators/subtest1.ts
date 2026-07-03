import type { GeneratorDef } from "./framework";
import {
  fmtComplex,
  fracTex,
  gcdInt,
  linTex,
  modPow,
  polyEval,
  polyTex,
  sqrtTex,
} from "./framework";
import { choice, randInt, randNonZero, type RNG } from "@/lib/rng";

/** Subtest I generators: Number & Quantity (1.x) and Algebra (2.x). */

const complexMult: GeneratorDef = {
  id: "s1-complex-mult",
  subtest: 1,
  domain: "1",
  subdomain: "1.1",
  baseDifficulty: 1100,
  variants: 7,
  generate(rng: RNG) {
    const a = randNonZero(rng, 5);
    const b = randNonZero(rng, 5);
    const c = randNonZero(rng, 5);
    const d = randNonZero(rng, 5);
    const re = a * c - b * d;
    const im = a * d + b * c;
    return {
      stem: `Which of the following equals $(${fmtComplex(a, b)})(${fmtComplex(c, d)})$?`,
      correct: `$${fmtComplex(re, im)}$`,
      distractors: [
        `$${fmtComplex(a * c + b * d, a * d + b * c)}$`, // forgot i^2 = -1
        `$${fmtComplex(a * c - b * d, a * d - b * c)}$`, // sign slip on imaginary part
        `$${fmtComplex(a * c + b * d, a * d - b * c)}$`, // conjugate confusion
      ],
      solution: `Expand: $(${fmtComplex(a, b)})(${fmtComplex(c, d)}) = ${a * c} + (${a * d})i + (${b * c})i + (${b * d})i^2$. Since $i^2 = -1$, the real part is $${a * c} - (${b * d}) = ${re}$ and the imaginary part is $${a * d} + ${b * c} = ${im}$, giving $${fmtComplex(re, im)}$.`,
    };
  },
};

const complexModulus: GeneratorDef = {
  id: "s1-complex-modulus",
  subtest: 1,
  domain: "1",
  subdomain: "1.1",
  baseDifficulty: 1050,
  variants: 6,
  generate(rng: RNG) {
    const a = randNonZero(rng, 8);
    const b = randNonZero(rng, 8);
    const n = a * a + b * b;
    return {
      stem: `What is the modulus of the complex number $z = ${fmtComplex(a, b)}$?`,
      correct: `$${sqrtTex(n)}$`,
      distractors: [
        `$${n}$`, // forgot the square root
        `$${Math.abs(a) + Math.abs(b)}$`, // added absolute values
        `$${sqrtTex(Math.abs(a * a - b * b) || n + 1)}$`, // subtracted squares
      ],
      solution: `$|a + bi| = \\sqrt{a^2 + b^2}$, so $|z| = \\sqrt{(${a})^2 + (${b})^2} = \\sqrt{${n}} = ${sqrtTex(n)}$.`,
    };
  },
};

const demoivre: GeneratorDef = {
  id: "s1-demoivre",
  subtest: 1,
  domain: "1",
  subdomain: "1.1",
  baseDifficulty: 1300,
  variants: 6,
  generate(rng: RNG) {
    const r = randInt(rng, 2, 3);
    const theta = choice(rng, [30, 45, 60, 120, 135, 150]);
    const n = randInt(rng, 2, 4);
    const rn = Math.pow(r, n);
    const ang = (n * theta) % 360;
    const cis = (rr: number, t: number) => `$${rr === 1 ? "" : rr}\\left(\\cos ${t}^\\circ + i\\sin ${t}^\\circ\\right)$`;
    return {
      stem: `Let $z = ${cis(r, theta).slice(1, -1)}$. Using DeMoivre's theorem, which of the following equals $z^{${n}}$?`,
      correct: cis(rn, ang),
      distractors: [
        cis(r * n, ang), // multiplied modulus by n instead of raising to n
        cis(rn, theta), // forgot to multiply the angle
        cis(r, ang), // forgot to raise the modulus
      ],
      solution: `DeMoivre: $[r(\\cos\\theta + i\\sin\\theta)]^n = r^n(\\cos n\\theta + i\\sin n\\theta)$. Here $r^{${n}} = ${r}^{${n}} = ${rn}$ and $n\\theta = ${n} \\cdot ${theta}^\\circ = ${n * theta}^\\circ$${n * theta !== ang ? `, which is coterminal with $${ang}^\\circ$` : ""}.`,
    };
  },
};

const simplifyRadical: GeneratorDef = {
  id: "s1-simplify-radical",
  subtest: 1,
  domain: "1",
  subdomain: "1.1",
  baseDifficulty: 1000,
  variants: 6,
  generate(rng: RNG) {
    const a = randInt(rng, 3, 7);
    const b = choice(rng, [2, 3, 5, 6, 7, 10, 11, 13]);
    const n = a * a * b;
    return {
      stem: `Which of the following is $\\sqrt{${n}}$ in simplest radical form?`,
      correct: `$${a}\\sqrt{${b}}$`,
      distractors: [
        `$${b}\\sqrt{${a}}$`, // swapped
        `$${a * b}$`, // dropped the radical
        `$${a}\\sqrt{${a * b}}$`, // pulled the square root of a^2 but left a inside too
      ],
      solution: `$${n} = ${a}^2 \\cdot ${b}$, so $\\sqrt{${n}} = \\sqrt{${a}^2}\\cdot\\sqrt{${b}} = ${a}\\sqrt{${b}}$.`,
    };
  },
};

const modExp: GeneratorDef = {
  id: "s1-mod-exp",
  subtest: 1,
  domain: "1",
  subdomain: "1.2",
  baseDifficulty: 1250,
  variants: 7,
  generate(rng: RNG) {
    const a = randInt(rng, 2, 9);
    const k = randInt(rng, 5, 12);
    const m = choice(rng, [5, 7, 9, 11, 13]);
    const ans = modPow(a, k, m);
    const cands = [
      (a * k) % m,
      (a + k) % m,
      (ans + 1) % m,
      (ans + 2) % m,
      modPow(a, k, m + 2) % m,
    ];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c !== ans && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the remainder when $${a}^{${k}}$ is divided by $${m}$?`,
      correct: `$${ans}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `Work modulo $${m}$ by repeated squaring or by finding the cycle of powers of $${a}$: the powers of $${a}$ repeat with a period dividing $\\varphi(${m})$. Computing, $${a}^{${k}} \\equiv ${ans} \\pmod{${m}}$.`,
    };
  },
};

const gcdLcm: GeneratorDef = {
  id: "s1-gcd-lcm",
  subtest: 1,
  domain: "1",
  subdomain: "1.2",
  baseDifficulty: 1100,
  variants: 6,
  generate(rng: RNG) {
    const g = choice(rng, [4, 6, 10, 12, 15, 18]);
    const [p, q] = choice(rng, [
      [2, 3],
      [3, 4],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 6],
      [2, 7],
      [3, 7],
    ] as const);
    const a = g * p;
    const b = g * q;
    const askGcd = rng() < 0.5;
    const gcd = g;
    const lcm = g * p * q;
    const correct = askGcd ? gcd : lcm;
    const cands = askGcd ? [lcm, p * q, 2 * g, Math.min(a, b), g + p] : [gcd, a * b, p * q, lcm / 2, a + b];
    const distractors: number[] = [];
    for (const c of cands) {
      if (Number.isInteger(c) && c !== correct && c > 0 && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the ${askGcd ? "greatest common divisor" : "least common multiple"} of $${a}$ and $${b}$?`,
      correct: `$${correct}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `$${a} = ${g} \\cdot ${p}$ and $${b} = ${g} \\cdot ${q}$ with $\\gcd(${p}, ${q}) = 1$, so $\\gcd(${a}, ${b}) = ${g}$ and $\\operatorname{lcm}(${a}, ${b}) = \\frac{${a} \\cdot ${b}}{\\gcd} = ${lcm}$. The answer is $${correct}$.`,
    };
  },
};

interface StructureFact {
  tex: string;
  isField: boolean;
  why: string;
}

const STRUCTURES: StructureFact[] = [
  { tex: "\\mathbb{Q}", isField: true, why: "every nonzero rational has a rational reciprocal" },
  { tex: "\\mathbb{R}", isField: true, why: "every nonzero real has a real reciprocal" },
  { tex: "\\mathbb{C}", isField: true, why: "every nonzero complex number is invertible" },
  { tex: "\\mathbb{Z}_5", isField: true, why: "5 is prime, so every nonzero class is invertible mod 5" },
  { tex: "\\mathbb{Z}_7", isField: true, why: "7 is prime, so every nonzero class is invertible mod 7" },
  { tex: "\\mathbb{Z}_{11}", isField: true, why: "11 is prime, so every nonzero class is invertible mod 11" },
  { tex: "\\mathbb{Z}", isField: false, why: "most nonzero integers (e.g. 2) have no integer multiplicative inverse" },
  { tex: "\\mathbb{N}", isField: false, why: "it lacks additive inverses" },
  { tex: "\\mathbb{Z}_6", isField: false, why: "$2 \\cdot 3 \\equiv 0$, so it has zero divisors and 2 has no inverse" },
  { tex: "\\mathbb{Z}_8", isField: false, why: "8 is composite: $2 \\cdot 4 \\equiv 0$ gives zero divisors" },
  { tex: "\\mathbb{Z}_9", isField: false, why: "9 is composite: $3 \\cdot 3 \\equiv 0$ gives zero divisors" },
  { tex: "\\mathbb{Z}_{12}", isField: false, why: "12 is composite: $3 \\cdot 4 \\equiv 0$ gives zero divisors" },
  { tex: "\\text{the set of } 2 \\times 2 \\text{ real matrices}", isField: false, why: "nonzero singular matrices have no multiplicative inverse (and multiplication is not commutative)" },
  { tex: "2\\mathbb{Z} \\text{ (the even integers)}", isField: false, why: "it has no multiplicative identity" },
];

const fieldPick: GeneratorDef = {
  id: "s1-field-pick",
  subtest: 1,
  domain: "2",
  subdomain: "2.1",
  baseDifficulty: 1250,
  variants: 6,
  generate(rng: RNG) {
    const askField = rng() < 0.5;
    const fields = STRUCTURES.filter((s) => s.isField);
    const nonFields = STRUCTURES.filter((s) => !s.isField);
    const pickN = (arr: StructureFact[], n: number) => {
      const pool = arr.slice();
      const out: StructureFact[] = [];
      while (out.length < n) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return out;
    };
    const correct = askField ? pickN(fields, 1)[0] : pickN(nonFields, 1)[0];
    const others = askField ? pickN(nonFields, 3) : pickN(fields, 3);
    return {
      stem: `With the usual addition and multiplication, which of the following is ${askField ? "" : "NOT "}a field?`,
      correct: `$${correct.tex}$`,
      distractors: others.map((s) => `$${s.tex}$`),
      solution: `$${correct.tex}$ is ${correct.isField ? "" : "not "}a field: ${correct.why}. ${others
        .map((s) => `$${s.tex}$ is ${s.isField ? "a field (" : "not a field ("}${s.why})`)
        .join("; ")}.`,
    };
  },
};

const quadSumProduct: GeneratorDef = {
  id: "s1-quad-sum-product",
  subtest: 1,
  domain: "2",
  subdomain: "2.2",
  baseDifficulty: 1150,
  variants: 7,
  generate(rng: RNG) {
    const a = randInt(rng, 2, 6);
    const b = randNonZero(rng, 9);
    const c = randNonZero(rng, 9);
    const askSum = rng() < 0.5;
    const correct = askSum ? fracTex(-b, a) : fracTex(c, a);
    const distractors = askSum
      ? [fracTex(b, a), fracTex(c, a), fracTex(-c, a)]
      : [fracTex(-c, a), fracTex(-b, a), fracTex(b, a)];
    return {
      stem: `What is the ${askSum ? "sum" : "product"} of the roots (counted with multiplicity, over $\\mathbb{C}$) of $${polyTex([a, b, c])} = 0$?`,
      correct: `$${correct}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `For $ax^2 + bx + c = 0$, Vieta's formulas give sum $= -\\frac{b}{a}$ and product $= \\frac{c}{a}$. Here the ${askSum ? "sum" : "product"} is $${askSum ? `-\\frac{${b}}{${a}} = ${fracTex(-b, a)}` : `\\frac{${c}}{${a}} = ${fracTex(c, a)}`}$.`,
    };
  },
};

function divisors(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= Math.abs(n); d++) if (n % d === 0) out.push(d);
  return out;
}

const rationalRoot: GeneratorDef = {
  id: "s1-rational-root",
  subtest: 1,
  domain: "2",
  subdomain: "2.2",
  baseDifficulty: 1250,
  variants: 6,
  generate(rng: RNG) {
    const a = choice(rng, [2, 3, 4, 6]);
    const c = choice(rng, [4, 6, 8, 9, 10, 15]);
    const m1 = randNonZero(rng, 7);
    const m2 = randNonZero(rng, 7);
    const isPossible = (p: number, q: number) => {
      const g = gcdInt(p, q);
      const pn = p / g;
      const qn = q / g;
      return c % pn === 0 && a % qn === 0;
    };
    // A valid non-integer candidate root p/q in lowest terms.
    const valid: Array<[number, number]> = [];
    for (const p of divisors(c)) {
      for (const q of divisors(a)) {
        if (q > 1 && gcdInt(p, q) === 1) valid.push([p, q]);
      }
    }
    if (valid.length === 0) throw new Error("rationalRoot: no valid candidates");
    const [cp, cq] = valid[Math.floor(rng() * valid.length)];
    // Distractors: fractions that violate the theorem.
    const bad: Array<[number, number]> = [];
    for (let p = 1; p <= c + 3 && bad.length < 12; p++) {
      for (let q = 2; q <= a + 3; q++) {
        if (gcdInt(p, q) === 1 && !isPossible(p, q)) bad.push([p, q]);
      }
    }
    const distractors: string[] = [];
    while (distractors.length < 3 && bad.length > 0) {
      const [p, q] = bad.splice(Math.floor(rng() * bad.length), 1)[0];
      const s = `$${fracTex(p, q)}$`;
      if (!distractors.includes(s)) distractors.push(s);
    }
    return {
      stem: `Consider $p(x) = ${polyTex([a, m1, m2, c])}$. According to the Rational Root Theorem, which of the following could be a rational root of $p(x) = 0$?`,
      correct: `$${fracTex(cp, cq)}$`,
      distractors,
      solution: `Any rational root $\\frac{p}{q}$ in lowest terms must have $p$ dividing the constant term $${c}$ and $q$ dividing the leading coefficient $${a}$. For $${fracTex(cp, cq)}$: $${cp} \\mid ${c}$ and $${cq} \\mid ${a}$, so it is a possible root. Each other choice fails one of the two divisibility conditions.`,
    };
  },
};

const remainderThm: GeneratorDef = {
  id: "s1-remainder-thm",
  subtest: 1,
  domain: "2",
  subdomain: "2.2",
  baseDifficulty: 1150,
  variants: 7,
  generate(rng: RNG) {
    const coeffs = [randInt(rng, 1, 3), randNonZero(rng, 6), randNonZero(rng, 6), randNonZero(rng, 6)];
    const k = randNonZero(rng, 3);
    const ans = polyEval(coeffs, k);
    const cands = [polyEval(coeffs, -k), coeffs[3], polyEval(coeffs, 1), ans + 2 * k, ans - k];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c !== ans && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    const divisor = linTex(1, -k);
    return {
      stem: `What is the remainder when $p(x) = ${polyTex(coeffs)}$ is divided by $${divisor}$?`,
      correct: `$${ans}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `By the Remainder Theorem, the remainder on dividing by $${divisor}$ is $p(${k})$. Evaluating: $p(${k}) = ${ans}$. (A common error is evaluating $p(${-k})$, which corresponds to dividing by $${linTex(1, k)}$.)`,
    };
  },
};

const composeEval: GeneratorDef = {
  id: "s1-compose-eval",
  subtest: 1,
  domain: "2",
  subdomain: "2.3",
  baseDifficulty: 1050,
  variants: 7,
  generate(rng: RNG) {
    const a = randNonZero(rng, 5);
    const b = randNonZero(rng, 7);
    const c = randNonZero(rng, 7);
    const k = randNonZero(rng, 4);
    const gk = k * k + c;
    const ans = a * gk + b;
    const cands = [Math.pow(a * k + b, 2) + c, a * k * k + c + b, a * k + b + k * k + c, ans + a];
    const distractors: number[] = [];
    for (const d of cands) {
      if (d !== ans && !distractors.includes(d)) distractors.push(d);
      if (distractors.length === 3) break;
    }
    return {
      stem: `Let $f(x) = ${linTex(a, b)}$ and $g(x) = ${polyTex([1, 0, c])}$. What is $(f \\circ g)(${k})$?`,
      correct: `$${ans}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `$(f \\circ g)(${k}) = f(g(${k}))$. First $g(${k}) = (${k})^2 ${c < 0 ? "-" : "+"} ${Math.abs(c)} = ${gk}$, then $f(${gk}) = ${a}(${gk}) ${b < 0 ? "-" : "+"} ${Math.abs(b)} = ${ans}$. (Computing $g(f(${k}))$ instead gives $${Math.pow(a * k + b, 2) + c}$.)`,
    };
  },
};

const inverseLinear: GeneratorDef = {
  id: "s1-inverse-linear",
  subtest: 1,
  domain: "2",
  subdomain: "2.3",
  baseDifficulty: 1100,
  variants: 6,
  generate(rng: RNG) {
    const a = randInt(rng, 2, 7);
    const b = randNonZero(rng, 9);
    const sgn = b >= 0 ? "-" : "+";
    const opp = b >= 0 ? "+" : "-";
    const B = Math.abs(b);
    return {
      stem: `If $f(x) = ${linTex(a, b)}$, what is $f^{-1}(x)$?`,
      correct: `$f^{-1}(x) = \\dfrac{x ${sgn} ${B}}{${a}}$`,
      distractors: [
        `$f^{-1}(x) = \\dfrac{x ${opp} ${B}}{${a}}$`, // sign slip
        `$f^{-1}(x) = \\dfrac{1}{${linTex(a, b)}}$`, // reciprocal misconception
        `$f^{-1}(x) = ${linTex(a, -b)}$`, // negated b only
      ],
      solution: `Set $y = ${linTex(a, b)}$ and solve for $x$: $x = \\dfrac{y ${sgn} ${B}}{${a}}$. Swapping variables, $f^{-1}(x) = \\dfrac{x ${sgn} ${B}}{${a}}$. Note $f^{-1}$ is the inverse under composition, not the reciprocal $\\frac{1}{f(x)}$.`,
    };
  },
};

const logSolve: GeneratorDef = {
  id: "s1-log-solve",
  subtest: 1,
  domain: "2",
  subdomain: "2.3",
  baseDifficulty: 1050,
  variants: 6,
  generate(rng: RNG) {
    const b = choice(rng, [2, 3, 4, 5, 10]);
    const k = randInt(rng, 2, 4);
    const ans = Math.pow(b, k);
    const cands = [Math.pow(k, b), b * k, b + k, ans / b];
    const distractors: number[] = [];
    for (const d of cands) {
      if (Number.isInteger(d) && d !== ans && !distractors.includes(d)) distractors.push(d);
      if (distractors.length === 3) break;
    }
    return {
      stem: `If $\\log_{${b}} x = ${k}$, what is $x$?`,
      correct: `$${ans}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `$\\log_{${b}} x = ${k}$ means $x = ${b}^{${k}} = ${ans}$ by the definition of the logarithm.`,
    };
  },
};

const geoSeries: GeneratorDef = {
  id: "s1-geo-series",
  subtest: 1,
  domain: "2",
  subdomain: "2.3",
  baseDifficulty: 1200,
  variants: 6,
  generate(rng: RNG) {
    const a = randInt(rng, 1, 9);
    const m = randInt(rng, 2, 5);
    const neg = rng() < 0.4;
    // r = ±1/m; S = a / (1 - r)
    const denom = neg ? m + 1 : m - 1; // a / (1 ∓ 1/m) = am / (m ∓ 1)
    const wrongDenom = neg ? m - 1 : m + 1;
    const rTex = `${neg ? "-" : ""}${fracTex(1, m)}`;
    const correct = fracTex(a * m, denom);
    const cands = [fracTex(a * m, wrongDenom), fracTex(a * denom, m), fracTex(a, denom), fracTex(a * m, m)];
    const distractors: string[] = [];
    for (const d of cands) {
      if (d !== correct && !distractors.includes(d)) distractors.push(d);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the sum of the infinite geometric series with first term $${a}$ and common ratio $r = ${rTex}$?`,
      correct: `$${correct}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `For $|r| < 1$, $S = \\dfrac{a}{1 - r} = \\dfrac{${a}}{1 - \\left(${rTex}\\right)} = \\dfrac{${a}}{${fracTex(denom, m)}} = ${correct}$. Watch the sign in $1 - r$ when $r$ is negative.`,
    };
  },
};

const det2x2: GeneratorDef = {
  id: "s1-det-2x2",
  subtest: 1,
  domain: "2",
  subdomain: "2.4",
  baseDifficulty: 1050,
  variants: 6,
  generate(rng: RNG) {
    const a = randNonZero(rng, 6);
    const b = randNonZero(rng, 6);
    const c = randNonZero(rng, 6);
    const d = randNonZero(rng, 6);
    const det = a * d - b * c;
    if (det === 0) throw new Error("singular"); // retry via framework? throw is not caught...
    const cands = [a * d + b * c, b * c - a * d, a * c - b * d, det + 1];
    const distractors: number[] = [];
    for (const x of cands) {
      if (x !== det && !distractors.includes(x)) distractors.push(x);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the determinant of $\\begin{pmatrix} ${a} & ${b} \\\\ ${c} & ${d} \\end{pmatrix}$?`,
      correct: `$${det}$`,
      distractors: distractors.map((x) => `$${x}$`),
      solution: `$\\det = ad - bc = (${a})(${d}) - (${b})(${c}) = ${a * d} - (${b * c}) = ${det}$.`,
    };
  },
};

const dotProduct: GeneratorDef = {
  id: "s1-dot-product",
  subtest: 1,
  domain: "2",
  subdomain: "2.4",
  baseDifficulty: 1100,
  variants: 6,
  generate(rng: RNG) {
    const a1 = randNonZero(rng, 6);
    const a2 = randNonZero(rng, 6);
    const b1 = randNonZero(rng, 6);
    const b2 = randNonZero(rng, 6);
    const ans = a1 * b1 + a2 * b2;
    const cands = [a1 * b1 - a2 * b2, a1 * b2 + a2 * b1, a1 + b1 + a2 + b2, ans + 1];
    const distractors: number[] = [];
    for (const x of cands) {
      if (x !== ans && !distractors.includes(x)) distractors.push(x);
      if (distractors.length === 3) break;
    }
    return {
      stem: `Let $\\mathbf{u} = \\langle ${a1}, ${a2} \\rangle$ and $\\mathbf{v} = \\langle ${b1}, ${b2} \\rangle$. What is $\\mathbf{u} \\cdot \\mathbf{v}$?`,
      correct: `$${ans}$`,
      distractors: distractors.map((x) => `$${x}$`),
      solution: `$\\mathbf{u} \\cdot \\mathbf{v} = u_1 v_1 + u_2 v_2 = (${a1})(${b1}) + (${a2})(${b2}) = ${a1 * b1} + (${a2 * b2}) = ${ans}$.`,
    };
  },
};

export const SUBTEST1_GENERATORS: GeneratorDef[] = [
  complexMult,
  complexModulus,
  demoivre,
  simplifyRadical,
  modExp,
  gcdLcm,
  fieldPick,
  quadSumProduct,
  rationalRoot,
  remainderThm,
  composeEval,
  inverseLinear,
  logSolve,
  geoSeries,
  det2x2,
  dotProduct,
];
