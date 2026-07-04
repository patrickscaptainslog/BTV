import type { GeneratorDef } from "./framework";
import { fracTex, nCk, nPk } from "./framework";
import { inscribedAngleFigure, pointsGridFigure, specialRightFigure, triangleExteriorFigure } from "./figures";
import { choice, randInt, randNonZero, type RNG } from "@/lib/rng";

/** Subtest II generators: Geometry (3.x) and Probability & Statistics (4.x). */

const triangleExterior: GeneratorDef = {
  id: "s2-triangle-exterior",
  subtest: 2,
  domain: "3",
  subdomain: "3.1",
  baseDifficulty: 1000,
  variants: 6,
  generate(rng: RNG) {
    const A = randInt(rng, 25, 80);
    const B = randInt(rng, 25, 80);
    if (A + B >= 165 || A === B) throw new Error("degenerate");
    const ext = A + B;
    const cands = [180 - A - B, 360 - (A + B), 180 - A, 180 - B];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c !== ext && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `In the figure, triangle $ABC$ has $\\angle A = ${A}^\\circ$ and $\\angle B = ${B}^\\circ$, and side $AC$ is extended through $C$. What is the measure of the marked exterior angle at vertex $C$?`,
      figure: triangleExteriorFigure(A, B),
      correct: `$${ext}^\\circ$`,
      distractors: distractors.map((d) => `$${d}^\\circ$`),
      solution: `The exterior angle at a vertex equals the sum of the two remote interior angles: $${A}^\\circ + ${B}^\\circ = ${ext}^\\circ$. (Equivalently, $\\angle C = 180^\\circ - ${A}^\\circ - ${B}^\\circ = ${180 - A - B}^\\circ$, and the exterior angle is $180^\\circ - \\angle C$.)`,
    };
  },
};

const inscribedAngle: GeneratorDef = {
  id: "s2-inscribed-angle",
  subtest: 2,
  domain: "3",
  subdomain: "3.1",
  baseDifficulty: 1100,
  variants: 6,
  generate(rng: RNG) {
    const central = 2 * randInt(rng, 20, 80); // even, 40..160
    const inscribed = central / 2;
    const cands = [central, 2 * central, 180 - central, 180 - inscribed];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c > 0 && c !== inscribed && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `In the circle with center $O$ shown, the central angle measures $${central}^\\circ$, and the inscribed angle at $V$ intercepts the same arc. What is the measure of the inscribed angle?`,
      figure: inscribedAngleFigure(central),
      correct: `$${inscribed}^\\circ$`,
      distractors: distractors.map((d) => `$${d}^\\circ$`),
      solution: `The Inscribed Angle Theorem: an inscribed angle is half the central angle that intercepts the same arc, so the inscribed angle is $\\frac{${central}^\\circ}{2} = ${inscribed}^\\circ$.`,
    };
  },
};

const specialRight: GeneratorDef = {
  id: "s2-special-right",
  subtest: 2,
  domain: "3",
  subdomain: "3.1",
  baseDifficulty: 1100,
  variants: 6,
  generate(rng: RNG) {
    const s = randInt(rng, 3, 9);
    const kind = choice(rng, ["30-60-90-long", "30-60-90-hyp", "45-45-90"] as const);
    if (kind === "45-45-90") {
      return {
        stem: `An isosceles right triangle ($45^\\circ$–$45^\\circ$–$90^\\circ$) has legs of length $${s}$, as shown. What is the length of the hypotenuse (marked $?$)?`,
        figure: specialRightFigure("45-45-90", `${s}`, "?"),
        correct: `$${s}\\sqrt{2}$`,
        distractors: [`$${2 * s}$`, `$${s}\\sqrt{3}$`, `$\\dfrac{${s}\\sqrt{2}}{2}$`],
        solution: `In a $45$–$45$–$90$ triangle the hypotenuse is $\\sqrt{2}$ times a leg: $${s}\\sqrt{2}$. (By the Pythagorean theorem, $\\sqrt{${s}^2 + ${s}^2} = ${s}\\sqrt{2}$.)`,
      };
    }
    if (kind === "30-60-90-long") {
      return {
        stem: `In the $30^\\circ$–$60^\\circ$–$90^\\circ$ triangle shown, the side opposite the $30^\\circ$ angle has length $${s}$. What is the length of the side opposite the $60^\\circ$ angle (marked $?$)?`,
        figure: specialRightFigure("30-60-90-long", `${s}`, "?"),
        correct: `$${s}\\sqrt{3}$`,
        distractors: [`$${2 * s}$`, `$${s}\\sqrt{2}$`, `$\\dfrac{${s}\\sqrt{3}}{2}$`],
        solution: `The sides of a $30$–$60$–$90$ triangle are in ratio $1 : \\sqrt{3} : 2$ (opposite $30^\\circ$, $60^\\circ$, $90^\\circ$). With the short leg $${s}$, the side opposite $60^\\circ$ is $${s}\\sqrt{3}$.`,
      };
    }
    return {
      stem: `In the $30^\\circ$–$60^\\circ$–$90^\\circ$ triangle shown, the side opposite the $30^\\circ$ angle has length $${s}$. What is the length of the hypotenuse (marked $?$)?`,
      figure: specialRightFigure("30-60-90-hyp", `${s}`, "?"),
      correct: `$${2 * s}$`,
      distractors: [`$${s}\\sqrt{3}$`, `$${s}\\sqrt{2}$`, `$${3 * s}$`],
      solution: `The sides of a $30$–$60$–$90$ triangle are in ratio $1 : \\sqrt{3} : 2$. The hypotenuse is twice the short leg: $2 \\cdot ${s} = ${2 * s}$.`,
    };
  },
};

function fmtDeg(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

const polygonInterior: GeneratorDef = {
  id: "s2-polygon-interior",
  subtest: 2,
  domain: "3",
  subdomain: "3.1",
  baseDifficulty: 1050,
  variants: 6,
  generate(rng: RNG) {
    const n = choice(rng, [5, 6, 8, 9, 10, 12]);
    const interior = ((n - 2) * 180) / n;
    const cands = [360 / n, (n - 2) * 180, ((n - 1) * 180) / n, 180 - interior];
    const distractors: string[] = [];
    for (const c of cands) {
      const s = fmtDeg(c);
      if (c !== interior && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the measure of each interior angle of a regular ${n}-gon?`,
      correct: `$${fmtDeg(interior)}^\\circ$`,
      distractors: distractors.map((d) => `$${d}^\\circ$`),
      solution: `The interior angles of an $n$-gon sum to $(n-2) \\cdot 180^\\circ = ${(n - 2) * 180}^\\circ$. In a regular ${n}-gon each angle is $\\frac{${(n - 2) * 180}^\\circ}{${n}} = ${fmtDeg(interior)}^\\circ$. (Equivalently $180^\\circ$ minus the exterior angle $\\frac{360^\\circ}{${n}}$.)`,
    };
  },
};

const PYTH_TRIPLES: Array<[number, number, number]> = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [8, 15, 17],
  [9, 12, 15],
  [7, 24, 25],
];

const distancePoints: GeneratorDef = {
  id: "s2-distance",
  subtest: 2,
  domain: "3",
  subdomain: "3.2",
  baseDifficulty: 1000,
  variants: 6,
  generate(rng: RNG) {
    const [dx0, dy0, dist] = choice(rng, PYTH_TRIPLES);
    const dx = rng() < 0.5 ? dx0 : -dx0;
    const dy = rng() < 0.5 ? dy0 : -dy0;
    const x1 = randInt(rng, -6, 6);
    const y1 = randInt(rng, -6, 6);
    const x2 = x1 + dx;
    const y2 = y1 + dy;
    const cands = [Math.abs(dx) + Math.abs(dy), dx * dx + dy * dy, dist + 1, dist - 1];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c !== dist && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `What is the distance between the points $P(${x1}, ${y1})$ and $Q(${x2}, ${y2})$ shown on the grid?`,
      figure: pointsGridFigure(
        [
          { x: x1, y: y1, label: "P" },
          { x: x2, y: y2, label: "Q" },
        ],
        true
      ),
      correct: `$${dist}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `$d = \\sqrt{(\\Delta x)^2 + (\\Delta y)^2} = \\sqrt{(${dx})^2 + (${dy})^2} = \\sqrt{${dx * dx} + ${dy * dy}} = \\sqrt{${dist * dist}} = ${dist}$.`,
    };
  },
};

const circleEquation: GeneratorDef = {
  id: "s2-circle-equation",
  subtest: 2,
  domain: "3",
  subdomain: "3.2",
  baseDifficulty: 1100,
  variants: 6,
  generate(rng: RNG) {
    const h = randNonZero(rng, 6);
    let k = randNonZero(rng, 6);
    if (k === h) k = -k;
    const r = randInt(rng, 2, 9);
    const term = (v: string, c: number) => `(${v} ${c >= 0 ? "-" : "+"} ${Math.abs(c)})^2`;
    const eq = (hh: number, kk: number, rhs: string) => `$${term("x", hh)} + ${term("y", kk)} = ${rhs}$`;
    return {
      stem: `Which of the following is an equation of the circle with center $(${h}, ${k})$ and radius $${r}$?`,
      correct: eq(h, k, `${r * r}`),
      distractors: [
        eq(-h, -k, `${r * r}`), // sign flip on center
        eq(h, k, `${r}`), // forgot to square the radius
        eq(k, h, `${r * r}`), // swapped h and k
      ],
      solution: `A circle with center $(h, k)$ and radius $r$ has equation $(x - h)^2 + (y - k)^2 = r^2$. With $h = ${h}$, $k = ${k}$, $r = ${r}$: $${term("x", h)} + ${term("y", k)} = ${r * r}$. Watch the signs: subtracting a negative coordinate produces a $+$ inside the parentheses.`,
    };
  },
};

const conicIdentify: GeneratorDef = {
  id: "s2-conic-identify",
  subtest: 2,
  domain: "3",
  subdomain: "3.2",
  baseDifficulty: 1200,
  variants: 6,
  generate(rng: RNG) {
    const kind = choice(rng, ["circle", "ellipse", "hyperbola", "parabola"] as const);
    let eqTex: string;
    let why: string;
    const c = randInt(rng, 2, 6);
    if (kind === "circle") {
      const a = randInt(rng, 2, 5);
      eqTex = `${a}x^2 + ${a}y^2 = ${a * c * c}`;
      why = `the $x^2$ and $y^2$ coefficients are equal and positive, so this is a circle (radius $${c}$ after dividing by $${a}$)`;
    } else if (kind === "ellipse") {
      const a = randInt(rng, 2, 5);
      const b = a + randInt(rng, 1, 4);
      eqTex = `${a}x^2 + ${b}y^2 = ${a * b * 4}`;
      why = `both squared terms are positive but with different coefficients ($${a} \\ne ${b}$), so this is an ellipse`;
    } else if (kind === "hyperbola") {
      const a = randInt(rng, 1, 5);
      const b = randInt(rng, 1, 5);
      eqTex = `${a === 1 ? "" : a}x^2 - ${b === 1 ? "" : b}y^2 = ${randInt(rng, 4, 36)}`;
      why = `the $x^2$ and $y^2$ terms have opposite signs, so this is a hyperbola`;
    } else {
      const a = randNonZero(rng, 3);
      const b = randNonZero(rng, 5);
      eqTex = `y = ${a === 1 ? "" : a === -1 ? "-" : a}x^2 ${b >= 0 ? "+" : "-"} ${Math.abs(b)}`;
      why = `only one variable is squared, so this is a parabola`;
    }
    const names = { circle: "Circle", ellipse: "Ellipse", hyperbola: "Hyperbola", parabola: "Parabola" };
    const others = (Object.keys(names) as Array<keyof typeof names>).filter((k2) => k2 !== kind);
    return {
      stem: `The graph of $${eqTex}$ is which type of conic section?`,
      correct: names[kind],
      distractors: others.map((k2) => names[k2]),
      solution: `In $${eqTex}$, ${why}.`,
    };
  },
};

const volumeSolid: GeneratorDef = {
  id: "s2-volume-solid",
  subtest: 2,
  domain: "3",
  subdomain: "3.3",
  baseDifficulty: 1100,
  variants: 7,
  generate(rng: RNG) {
    const kind = choice(rng, ["cylinder", "cone", "sphere", "pyramid"] as const);
    if (kind === "sphere") {
      const r = choice(rng, [3, 6]); // keeps 4/3·r^3 an integer
      const vol = (4 * r * r * r) / 3;
      return {
        stem: `What is the volume of a sphere with radius $${r}$?`,
        correct: `$${vol}\\pi$`,
        distractors: [
          `$${4 * r * r}\\pi$`, // surface area 4πr²
          `$${(r * r * r * 4)}\\pi$`, // forgot the 1/3
          `$${fracTex(4 * r * r, 3)}\\pi$`, // used r² instead of r³
        ],
        solution: `$V = \\frac{4}{3}\\pi r^3 = \\frac{4}{3}\\pi (${r})^3 = ${vol}\\pi$. Don't confuse this with the surface area $4\\pi r^2 = ${4 * r * r}\\pi$.`,
      };
    }
    if (kind === "pyramid") {
      const s = choice(rng, [3, 6, 9]);
      const h = randInt(rng, 2, 8);
      const vol = (s * s * h) / 3;
      return {
        stem: `A pyramid has a square base with side length $${s}$ and height $${h}$. What is its volume?`,
        correct: `$${vol}$`,
        distractors: [`$${s * s * h}$`, `$${(s * h * 4) / 2}$`, `$${s * s * h * 3}$`],
        solution: `$V = \\frac{1}{3}(\\text{base area})(\\text{height}) = \\frac{1}{3}(${s}^2)(${h}) = ${vol}$. Omitting the $\\frac{1}{3}$ gives the volume of the prism, $${s * s * h}$.`,
      };
    }
    const r = choice(rng, [2, 3, 4, 5]);
    const h = choice(rng, [3, 6, 9]);
    if (kind === "cylinder") {
      const vol = r * r * h;
      return {
        stem: `What is the volume of a right circular cylinder with radius $${r}$ and height $${h}$?`,
        correct: `$${vol}\\pi$`,
        distractors: [`$${fracTex(vol, 3)}\\pi$`, `$${2 * r * h}\\pi$`, `$${r * h * h}\\pi$`],
        solution: `$V = \\pi r^2 h = \\pi (${r})^2 (${h}) = ${vol}\\pi$. ($${2 * r * h}\\pi$ is the lateral surface area $2\\pi r h$.)`,
      };
    }
    const vol3 = r * r * h; // h chosen divisible by 3
    return {
      stem: `What is the volume of a right circular cone with radius $${r}$ and height $${h}$?`,
      correct: `$${vol3 / 3}\\pi$`,
      distractors: [`$${vol3}\\pi$`, `$${fracTex(vol3, 2)}\\pi$`, `$${(r * h * h) / 3}\\pi$`],
      solution: `$V = \\frac{1}{3}\\pi r^2 h = \\frac{1}{3}\\pi (${r})^2 (${h}) = ${vol3 / 3}\\pi$. A cone is one third of the cylinder with the same base and height ($${vol3}\\pi$).`,
    };
  },
};

const scaling: GeneratorDef = {
  id: "s2-scaling",
  subtest: 2,
  domain: "3",
  subdomain: "3.3",
  baseDifficulty: 1200,
  variants: 6,
  generate(rng: RNG) {
    const k = randInt(rng, 2, 4);
    const V = choice(rng, [5, 8, 10, 12]);
    const askVolume = rng() < 0.6;
    if (askVolume) {
      return {
        stem: `Two similar solids have a scale factor of $${k}$ (each length of the larger is $${k}$ times the corresponding length of the smaller). The smaller solid has volume $${V}$. What is the volume of the larger solid?`,
        correct: `$${V * k * k * k}$`,
        distractors: [`$${V * k}$`, `$${V * k * k}$`, `$${V * 3 * k}$`],
        solution: `Volume scales as the cube of the scale factor: $V_{\\text{large}} = ${k}^3 \\cdot ${V} = ${k * k * k} \\cdot ${V} = ${V * k * k * k}$. (Lengths scale by $k$, areas by $k^2$, volumes by $k^3$.)`,
      };
    }
    const A = choice(rng, [5, 8, 10, 12]);
    return {
      stem: `Two similar figures have a scale factor of $${k}$. The smaller figure has area $${A}$. What is the area of the larger figure?`,
      correct: `$${A * k * k}$`,
      distractors: [`$${A * k}$`, `$${A * k * k * k}$`, `$${A + k * k}$`],
      solution: `Area scales as the square of the scale factor: $A_{\\text{large}} = ${k}^2 \\cdot ${A} = ${A * k * k}$.`,
    };
  },
};

const TRANSFORMS = [
  { name: "a rotation of $90^\\circ$ counterclockwise about the origin", map: (x: number, y: number) => [-y, x] as const, rule: "(x, y) \\mapsto (-y, x)" },
  { name: "a rotation of $90^\\circ$ clockwise about the origin", map: (x: number, y: number) => [y, -x] as const, rule: "(x, y) \\mapsto (y, -x)" },
  { name: "a rotation of $180^\\circ$ about the origin", map: (x: number, y: number) => [-x, -y] as const, rule: "(x, y) \\mapsto (-x, -y)" },
  { name: "a reflection across the $x$-axis", map: (x: number, y: number) => [x, -y] as const, rule: "(x, y) \\mapsto (x, -y)" },
  { name: "a reflection across the $y$-axis", map: (x: number, y: number) => [-x, y] as const, rule: "(x, y) \\mapsto (-x, y)" },
  { name: "a reflection across the line $y = x$", map: (x: number, y: number) => [y, x] as const, rule: "(x, y) \\mapsto (y, x)" },
];

const transformPoint: GeneratorDef = {
  id: "s2-transform-point",
  subtest: 2,
  domain: "3",
  subdomain: "3.4",
  baseDifficulty: 1100,
  variants: 7,
  generate(rng: RNG) {
    const x = randNonZero(rng, 7);
    let y = randNonZero(rng, 7);
    if (Math.abs(x) === Math.abs(y)) throw new Error("degenerate");
    const idx = randInt(rng, 0, TRANSFORMS.length - 1);
    const t = TRANSFORMS[idx];
    const [ix, iy] = t.map(x, y);
    const others = TRANSFORMS.filter((_, i) => i !== idx)
      .map((o) => o.map(x, y))
      .filter(([ox, oy], i, arr) => arr.findIndex(([px, py]) => px === ox && py === oy) === i);
    const distractors: string[] = [];
    for (const [ox, oy] of others) {
      const s = `$(${ox}, ${oy})$`;
      if (!(ox === ix && oy === iy) && !distractors.includes(s)) distractors.push(s);
      if (distractors.length === 3) break;
    }
    return {
      stem: `The point $P(${x}, ${y})$ is shown on the grid. What is the image of $P$ under ${t.name}?`,
      figure: pointsGridFigure([{ x, y, label: "P" }]),
      correct: `$(${ix}, ${iy})$`,
      distractors,
      solution: `${t.name.charAt(0).toUpperCase() + t.name.slice(1)} maps $${t.rule}$, so $(${x}, ${y}) \\mapsto (${ix}, ${iy})$.`,
    };
  },
};

const reflectionsCompose: GeneratorDef = {
  id: "s2-reflections-compose",
  subtest: 2,
  domain: "3",
  subdomain: "3.4",
  baseDifficulty: 1300,
  variants: 6,
  generate(rng: RNG) {
    const a = randInt(rng, -4, 2);
    const gap = randInt(rng, 2, 5);
    const b = a + gap; // reflect across x=a, then x=b: translation by 2(b-a) in +x
    const shift = 2 * gap;
    return {
      stem: `A figure in the plane is reflected across the line $x = ${a}$, and the image is then reflected across the line $x = ${b}$. The composition of these two reflections is equivalent to which single transformation?`,
      correct: `A translation $${shift}$ units to the right`,
      distractors: [
        `A translation $${gap}$ units to the right`, // forgot the factor of 2
        `A translation $${shift}$ units to the left`, // direction reversed
        `A reflection across the line $x = ${fracTex(a + b, 2)}$`, // halfway line, but one reflection can't equal two
      ],
      solution: `Reflecting across two parallel lines is a translation perpendicular to the lines by twice the distance between them, in the direction from the first line toward the second. The distance is $${b} - (${a}) = ${gap}$, so the composition is a translation of $2 \\cdot ${gap} = ${shift}$ units in the $+x$ direction. It cannot be a single reflection: each reflection reverses orientation, so their composition preserves it.`,
    };
  },
};

const probNoReplacement: GeneratorDef = {
  id: "s2-prob-no-replacement",
  subtest: 2,
  domain: "4",
  subdomain: "4.1",
  baseDifficulty: 1150,
  variants: 7,
  generate(rng: RNG) {
    const r = randInt(rng, 3, 7);
    const b = randInt(rng, 3, 7);
    const n = r + b;
    const correct = fracTex(r * (r - 1), n * (n - 1));
    const cands = [
      fracTex(r * r, n * n), // treated draws as independent (with replacement)
      fracTex(r * (r - 1), n * n), // mixed denominators
      fracTex(2 * r, n), // nonsense addition
      fracTex(r, n),
    ];
    const distractors: string[] = [];
    for (const c of cands) {
      if (c !== correct && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `A bag contains $${r}$ red and $${b}$ blue marbles. Two marbles are drawn at random without replacement. What is the probability that both are red?`,
      correct: `$${correct}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `$P(\\text{both red}) = \\frac{${r}}{${n}} \\cdot \\frac{${r - 1}}{${n - 1}} = ${correct}$. Because the first marble is not replaced, the second factor uses $${r - 1}$ red out of $${n - 1}$ remaining — squaring $\\frac{${r}}{${n}}$ would wrongly assume independence.`,
    };
  },
};

const committee: GeneratorDef = {
  id: "s2-committee",
  subtest: 2,
  domain: "4",
  subdomain: "4.1",
  baseDifficulty: 1150,
  variants: 6,
  generate(rng: RNG) {
    const n = randInt(rng, 6, 10);
    const k = randInt(rng, 2, 4);
    const ans = nCk(n, k);
    const cands = [nPk(n, k), nCk(n, k - 1), n * k, nCk(n - 1, k)];
    const distractors: number[] = [];
    for (const c of cands) {
      if (c !== ans && c > 0 && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `A committee of $${k}$ people is to be chosen from a group of $${n}$ people. How many different committees are possible?`,
      correct: `$${ans}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `Order doesn't matter in a committee, so use combinations: $\\binom{${n}}{${k}} = \\frac{${n}!}{${k}!\\,${n - k}!} = ${ans}$. Using permutations $P(${n}, ${k}) = ${nPk(n, k)}$ would count each committee $${k}!$ times.`,
    };
  },
};

const expectedValue: GeneratorDef = {
  id: "s2-expected-value",
  subtest: 2,
  domain: "4",
  subdomain: "4.1",
  baseDifficulty: 1250,
  variants: 6,
  generate(rng: RNG) {
    const t = randInt(rng, 3, 5); // win if roll >= t
    const w = randInt(rng, 2, 9); // win amount
    const l = randInt(rng, 1, 6); // loss amount
    const winCount = 7 - t;
    const loseCount = t - 1;
    const num = w * winCount - l * loseCount;
    const correct = fracTex(num, 6);
    const cands = [
      fracTex(w * loseCount - l * winCount, 6), // swapped the counts
      fracTex(w * winCount + l * loseCount, 6), // forgot the loss is negative
      fracTex(w - l, 2), // ignored the probabilities
      fracTex(num, 2),
    ];
    const distractors: string[] = [];
    for (const c of cands) {
      if (c !== correct && !distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    return {
      stem: `A game uses one fair six-sided die. You win $${w}$ dollars if the roll is at least $${t}$, and you lose $${l}$ dollars otherwise. What is the expected value of the game, in dollars?`,
      correct: `$${correct}$`,
      distractors: distractors.map((d) => `$${d}$`),
      solution: `$P(\\text{win}) = \\frac{${winCount}}{6}$ (rolls $${t}$ through $6$) and $P(\\text{lose}) = \\frac{${loseCount}}{6}$. So $E = ${w} \\cdot \\frac{${winCount}}{6} + (-${l}) \\cdot \\frac{${loseCount}}{6} = \\frac{${w * winCount} - ${l * loseCount}}{6} = ${correct}$ dollars.`,
    };
  },
};

const statsTransform: GeneratorDef = {
  id: "s2-stats-transform",
  subtest: 2,
  domain: "4",
  subdomain: "4.2",
  baseDifficulty: 1250,
  variants: 6,
  generate(rng: RNG) {
    const m = randInt(rng, 10, 40);
    const s = randInt(rng, 2, 8);
    const k = randInt(rng, 2, 4);
    const c = randInt(rng, 3, 10);
    const pair = (mm: number, ss: number) => `mean $${mm}$, standard deviation $${ss}$`;
    return {
      stem: `A data set has mean $${m}$ and standard deviation $${s}$. Every value is multiplied by $${k}$, and then $${c}$ is added to each result. What are the mean and standard deviation of the new data set?`,
      correct: pair(k * m + c, k * s),
      distractors: [
        pair(k * m + c, k * s + c), // added c to the SD too
        pair(k * m, k * s), // forgot the shift on the mean
        pair(m + c, s + c), // ignored the multiplication
      ],
      solution: `Multiplying by $${k}$ scales both mean and standard deviation by $${k}$; adding $${c}$ shifts the mean by $${c}$ but leaves spread unchanged. New mean $= ${k} \\cdot ${m} + ${c} = ${k * m + c}$; new standard deviation $= ${k} \\cdot ${s} = ${k * s}$.`,
    };
  },
};

const empiricalRule: GeneratorDef = {
  id: "s2-empirical-rule",
  subtest: 2,
  domain: "4",
  subdomain: "4.2",
  baseDifficulty: 1150,
  variants: 6,
  generate(rng: RNG) {
    const mu = randInt(rng, 40, 90);
    const sigma = choice(rng, [3, 4, 5, 6, 8]);
    const z = choice(rng, [1, 2] as const);
    const lo = mu - z * sigma;
    const hi = mu + z * sigma;
    const pct = z === 1 ? 68 : 95;
    const others = [68, 95, 99.7, 50, 34, 47.5].filter((p) => p !== pct);
    const distractors: string[] = [];
    for (const p of others) {
      const sStr = `About $${p}\\%$`;
      if (!distractors.includes(sStr)) distractors.push(sStr);
      if (distractors.length === 3) break;
    }
    return {
      stem: `Scores on an exam are approximately normally distributed with mean $${mu}$ and standard deviation $${sigma}$. According to the empirical rule, approximately what percent of scores fall between $${lo}$ and $${hi}$?`,
      correct: `About $${pct}\\%$`,
      distractors,
      solution: `$${lo}$ and $${hi}$ are exactly $${z}$ standard deviation${z > 1 ? "s" : ""} from the mean ($${mu} \\pm ${z} \\cdot ${sigma}$). The empirical rule: about $68\\%$ of values lie within 1 SD, $95\\%$ within 2 SD, and $99.7\\%$ within 3 SD. So the answer is about $${pct}\\%$.`,
    };
  },
};

const meanMedianOutlier: GeneratorDef = {
  id: "s2-mean-median-outlier",
  subtest: 2,
  domain: "4",
  subdomain: "4.2",
  baseDifficulty: 1200,
  variants: 6,
  generate(rng: RNG) {
    const base = randInt(rng, 10, 20);
    const vals = [base, base + 1, base + 2, base + 3, base + 4];
    const high = rng() < 0.5;
    const outlier = high ? base + randInt(rng, 30, 60) : Math.max(0, base - randInt(rng, 10, 15) - 20);
    const data = [...vals, outlier].sort((x, y) => x - y);
    const mean = data.reduce((s2, v) => s2 + v, 0) / data.length;
    const median = (data[2] + data[3]) / 2;
    if (mean === median) throw new Error("degenerate");
    const meanBigger = mean > median;
    return {
      stem: `Consider the data set $\\{${data.join(",\\ ")}\\}$. Which statement correctly compares its mean and median?`,
      correct: meanBigger
        ? "The mean is greater than the median, because the high outlier pulls the mean upward."
        : "The mean is less than the median, because the low outlier pulls the mean downward.",
      distractors: [
        meanBigger
          ? "The mean is less than the median, because the high outlier pulls the median upward."
          : "The mean is greater than the median, because the low outlier pulls the median downward.",
        "The mean and median are equal, because the data set is symmetric.",
        meanBigger
          ? "The median is greater than the mean, because the median counts every value."
          : "The median is less than the mean, because the median counts every value.",
      ],
      solution: `Sorted, the middle two values are $${data[2]}$ and $${data[3]}$, so the median is $${median}$. The mean is $\\frac{${data.join(" + ")}}{6} = ${Number.isInteger(mean) ? mean : mean.toFixed(2)}$. The outlier ($${outlier}$) affects the mean but barely moves the median, so the mean is ${meanBigger ? "greater" : "less"} than the median.`,
    };
  },
};

export const SUBTEST2_GENERATORS: GeneratorDef[] = [
  triangleExterior,
  inscribedAngle,
  specialRight,
  polygonInterior,
  distancePoints,
  circleEquation,
  conicIdentify,
  volumeSolid,
  scaling,
  transformPoint,
  reflectionsCompose,
  probNoReplacement,
  committee,
  expectedValue,
  statsTransform,
  empiricalRule,
  meanMedianOutlier,
];
