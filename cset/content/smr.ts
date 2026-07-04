import type { DomainCode, SubdomainCode, Subtest } from "@/lib/types";

/**
 * CSET Mathematics Subject Matter Requirements map (Subtests I & II).
 * Structure follows the CTC's SMR document and the official test guide:
 * Subtest I (211): Number & Quantity (10 MC + 1 CR), Algebra (25 MC + 2 CR).
 * Subtest II (212): Geometry (25 MC + 2 CR), Probability & Statistics (10 MC + 1 CR).
 */

export interface DomainInfo {
  code: DomainCode;
  subtest: Subtest;
  name: string;
  mcCount: number;
  crCount: number;
  subdomains: SubdomainCode[];
}

export interface SubdomainInfo {
  code: SubdomainCode;
  domain: DomainCode;
  name: string;
  topics: string[];
}

export const DOMAINS: Record<DomainCode, DomainInfo> = {
  "1": {
    code: "1",
    subtest: 1,
    name: "Number and Quantity",
    mcCount: 10,
    crCount: 1,
    subdomains: ["1.1", "1.2"],
  },
  "2": {
    code: "2",
    subtest: 1,
    name: "Algebra",
    mcCount: 25,
    crCount: 2,
    subdomains: ["2.1", "2.2", "2.3", "2.4"],
  },
  "3": {
    code: "3",
    subtest: 2,
    name: "Geometry",
    mcCount: 25,
    crCount: 2,
    subdomains: ["3.1", "3.2", "3.3", "3.4"],
  },
  "4": {
    code: "4",
    subtest: 2,
    name: "Probability and Statistics",
    mcCount: 10,
    crCount: 1,
    subdomains: ["4.1", "4.2"],
  },
};

export const SUBDOMAINS: Record<SubdomainCode, SubdomainInfo> = {
  "1.1": {
    code: "1.1",
    domain: "1",
    name: "The Real and Complex Number Systems",
    topics: [
      "Structure of the real number line: order, density, completeness",
      "Rational vs. irrational numbers; proofs of irrationality",
      "Properties of exponents and radicals; rational exponents",
      "Complex numbers: arithmetic, conjugates, modulus, polar/trigonometric form",
      "DeMoivre's theorem and roots of complex numbers",
      "Vectors and matrices as quantities; dimensional analysis and unit conversion",
    ],
  },
  "1.2": {
    code: "1.2",
    domain: "1",
    name: "Number Theory",
    topics: [
      "Divisibility, primes, and the Fundamental Theorem of Arithmetic",
      "Euclidean algorithm, GCD and LCM",
      "Congruence and modular arithmetic",
      "Proof techniques: induction, contradiction, direct proof applied to integers",
    ],
  },
  "2.1": {
    code: "2.1",
    domain: "2",
    name: "Algebraic Structures",
    topics: [
      "Field axioms; rings and fields (ℤ, ℚ, ℝ, ℂ, ℤn)",
      "Closure, identity, inverses; why ℤ is not a field",
      "Order axioms and inequalities in ordered fields",
      "Isomorphism as structure preservation (informal)",
    ],
  },
  "2.2": {
    code: "2.2",
    domain: "2",
    name: "Polynomial Equations and Inequalities",
    topics: [
      "Solving quadratic, cubic-by-factoring, and rational equations",
      "Fundamental Theorem of Algebra; conjugate root pairs",
      "Rational Root Theorem, Remainder and Factor Theorems",
      "Polynomial division and synthetic division",
      "Polynomial, rational, and absolute-value inequalities",
      "Systems of equations (linear and nonlinear)",
    ],
  },
  "2.3": {
    code: "2.3",
    domain: "2",
    name: "Functions",
    topics: [
      "Domain, range, one-to-one, onto, inverse, composition",
      "Linear, quadratic, polynomial, rational, exponential, and logarithmic functions",
      "Transformations of graphs (shifts, stretches, reflections)",
      "Modeling with functions; growth and decay",
      "Arithmetic and geometric sequences and series",
    ],
  },
  "2.4": {
    code: "2.4",
    domain: "2",
    name: "Linear Algebra",
    topics: [
      "Vector arithmetic, dot product, angle between vectors, norm",
      "Matrix arithmetic, determinants, inverses (2×2 and 3×3)",
      "Solving linear systems: row reduction, Cramer's rule",
      "Matrices as linear transformations of the plane",
    ],
  },
  "3.1": {
    code: "3.1",
    domain: "3",
    name: "Plane Euclidean Geometry",
    topics: [
      "Parallel lines, angle relationships, triangle congruence and similarity",
      "Pythagorean theorem and its converse; special right triangles",
      "Circles: arcs, chords, tangents, inscribed and central angles",
      "Polygons: interior/exterior angles, area formulas",
      "Triangle centers, medians, altitudes; triangle inequality",
      "Classical constructions and justification of theorems",
    ],
  },
  "3.2": {
    code: "3.2",
    domain: "3",
    name: "Coordinate Geometry",
    topics: [
      "Distance, midpoint, slope; parallel and perpendicular lines",
      "Equations of circles, parabolas, ellipses, hyperbolas (conic sections)",
      "Proofs using coordinates; areas via coordinates",
      "Polar coordinates and conversion to rectangular",
    ],
  },
  "3.3": {
    code: "3.3",
    domain: "3",
    name: "Three-Dimensional Geometry",
    topics: [
      "Surface area and volume of prisms, cylinders, pyramids, cones, spheres",
      "Cross sections and solids of revolution",
      "Cavalieri's principle",
      "Effect of scaling on length, area, and volume",
    ],
  },
  "3.4": {
    code: "3.4",
    domain: "3",
    name: "Transformational Geometry",
    topics: [
      "Isometries: translations, rotations, reflections, glide reflections",
      "Dilations and similarity transformations",
      "Compositions of transformations; symmetry groups of figures",
      "Transformations in coordinates and with matrices",
    ],
  },
  "4.1": {
    code: "4.1",
    domain: "4",
    name: "Probability",
    topics: [
      "Sample spaces, events, complements; addition and multiplication rules",
      "Independence and conditional probability; Bayes' rule (informal)",
      "Counting: permutations, combinations, inclusion-exclusion",
      "Discrete random variables and expected value; binomial setting",
      "Geometric (area-based) probability",
    ],
  },
  "4.2": {
    code: "4.2",
    domain: "4",
    name: "Statistics",
    topics: [
      "Measures of center and spread: mean, median, mode, IQR, standard deviation",
      "Effect of transformations on summary statistics; outliers",
      "Normal distribution and the empirical rule; z-scores",
      "Sampling methods, bias, and study design",
      "Scatterplots, correlation vs. causation, least-squares regression (conceptual)",
    ],
  },
};

export const SUBTEST_INFO: Record<Subtest, {
  code: string;
  name: string;
  domains: DomainCode[];
  mcCount: number;
  crCount: number;
  minutes: number;
  calculator: boolean;
}> = {
  1: {
    code: "211",
    name: "Subtest I: Number and Quantity; Algebra",
    domains: ["1", "2"],
    mcCount: 35,
    crCount: 3,
    minutes: 150,
    calculator: false,
  },
  2: {
    code: "212",
    name: "Subtest II: Geometry; Probability and Statistics",
    domains: ["3", "4"],
    mcCount: 35,
    crCount: 3,
    minutes: 150,
    calculator: true,
  },
};

export function subdomainsForSubtest(subtest: Subtest): SubdomainCode[] {
  return SUBTEST_INFO[subtest].domains.flatMap((d) => DOMAINS[d].subdomains);
}
