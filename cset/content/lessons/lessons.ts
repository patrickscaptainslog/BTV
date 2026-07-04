import type { SubdomainCode } from "@/lib/types";

/**
 * Compact review sheets, one per SMR subdomain: core facts, the traps the
 * exam actually sets, and one fully worked example. Rendered by MathText
 * (paragraphs, **bold**, $inline$ and $$display$$ math, • bullet lines).
 */

export interface Lesson {
  code: SubdomainCode;
  title: string;
  body: string;
}

export const LESSONS: Record<SubdomainCode, Lesson> = {
  "1.1": {
    code: "1.1",
    title: "The Real and Complex Number Systems",
    body: `**Core facts.** The reals are an ordered field that is **complete**: every nonempty set bounded above has a least upper bound. That property separates $\\mathbb{R}$ from $\\mathbb{Q}$ — the rationals are dense (between any two there's another) but have "holes" like $\\sqrt{2}$. A number is rational iff its decimal expansion terminates or repeats.

**Exponents and radicals.** $x^{p/q} = (\\sqrt[q]{x})^p$; simplify radicals by extracting the largest square: $\\sqrt{a^2 b} = a\\sqrt{b}$. Know the exponent laws cold — most errors are $(x^a)^b$ vs $x^a x^b$ confusions.

**Complex numbers.** $i^2 = -1$, and powers of $i$ cycle with period 4. For $z = a + bi$: conjugate $\\bar{z} = a - bi$, modulus $|z| = \\sqrt{a^2 + b^2}$, and the key identity $z\\bar{z} = |z|^2$. Divide by multiplying by the conjugate. In polar form $z = r(\\cos\\theta + i\\sin\\theta)$, **DeMoivre** gives $z^n = r^n(\\cos n\\theta + i\\sin n\\theta)$, and the $n$-th roots have modulus $\\sqrt[n]{r}$ with angles $\\frac{\\theta + 360^\\circ k}{n}$, spaced $\\frac{360^\\circ}{n}$ apart.

**Traps.** • Forgetting $i^2 = -1$ when FOILing (real part is $ac - bd$, not $ac + bd$). • Conjugate = negate the imaginary part ONLY. • In DeMoivre, the modulus is raised to the power while the angle is multiplied — mixing these up is the classic distractor. • $\\pi$ and $\\sqrt{2}$ are irrational, but sums/products of irrationals can be rational ($\\sqrt{2} \\cdot \\sqrt{2} = 2$).

**Worked example.** Compute $(2 + 3i)(4 - i)$: FOIL gives $8 - 2i + 12i - 3i^2 = 8 + 10i + 3 = 11 + 10i$. Its modulus: $\\sqrt{11^2 + 10^2} = \\sqrt{221}$ — which also equals $|2 + 3i| \\cdot |4 - i| = \\sqrt{13} \\cdot \\sqrt{17}$, since modulus is multiplicative. ✓`,
  },
  "1.2": {
    code: "1.2",
    title: "Number Theory",
    body: `**Core facts.** The **Fundamental Theorem of Arithmetic**: every integer $> 1$ factors into primes uniquely (up to order). From the factorization $n = p_1^{a_1} \\cdots p_k^{a_k}$ you can read off everything: number of divisors $= (a_1 + 1)\\cdots(a_k + 1)$, and $\\gcd$/$\\operatorname{lcm}$ take the min/max of exponents. Always: $\\gcd(a,b) \\cdot \\operatorname{lcm}(a,b) = ab$.

**Euclidean algorithm.** $\\gcd(a, b) = \\gcd(b, a \\bmod b)$ repeatedly; the last nonzero remainder is the gcd. It's fast and it's the tool the exam expects for big numbers.

**Modular arithmetic.** Congruences add and multiply: if $a \\equiv b$ and $c \\equiv d \\pmod m$, then $ac \\equiv bd$. For $a^k \\bmod m$, find the **cycle** of powers — it always repeats. An inverse of $a$ mod $m$ exists iff $\\gcd(a, m) = 1$; that's why $\\mathbb{Z}_p$ is a field exactly when $p$ is prime.

**Proof toolkit.** Induction = base case + inductive step (both!). Contradiction: assume the negation, derive absurdity (the $\\sqrt{2}$ proof). Contraposition: prove "not Q $\\Rightarrow$ not P" instead of "P $\\Rightarrow$ Q" — often cleaner for parity statements.

**Traps.** • 1 is not prime; 2 is the only even prime. • "Divides" points the small way: $d \\mid n$ means $d$ goes into $n$. • Euclid's lemma ($p \\mid ab \\Rightarrow p \\mid a$ or $p \\mid b$) needs $p$ PRIME: $6 \\mid 4 \\cdot 9$ but 6 divides neither. • The inductive step alone proves nothing without a base case.

**Worked example.** Find $\\gcd(252, 105)$: $252 = 2(105) + 42$; $105 = 2(42) + 21$; $42 = 2(21) + 0$. So $\\gcd = 21$, and $\\operatorname{lcm} = \\frac{252 \\cdot 105}{21} = 1260$. Check: $21 \\mid 252$ ✓, $21 \\mid 105$ ✓.`,
  },
  "2.1": {
    code: "2.1",
    title: "Algebraic Structures",
    body: `**Core facts.** A **field** is a set with $+$ and $\\times$ satisfying: both operations commutative and associative, identities $0 \\ne 1$, additive inverses for all, **multiplicative inverses for all nonzero elements**, and distributivity. Fields you know: $\\mathbb{Q}, \\mathbb{R}, \\mathbb{C}$, and $\\mathbb{Z}_p$ for $p$ prime.

**The standard non-examples — know WHY each fails.** $\\mathbb{Z}$: no multiplicative inverses (nothing times 2 gives 1). $\\mathbb{N}$: no additive inverses. $\\mathbb{Z}_n$ for composite $n$: zero divisors — in $\\mathbb{Z}_6$, $2 \\cdot 3 \\equiv 0$ with both factors nonzero, so 2 can't have an inverse. $2 \\times 2$ matrices: multiplication isn't commutative, and singular matrices have no inverse. Fields never have zero divisors: $ab = 0 \\Rightarrow a = 0$ or $b = 0$ (multiply by $a^{-1}$).

**Isomorphism.** Two structures are isomorphic when a bijection preserves the operation(s) — same structure, different labels. Flagship example: $\\ln : (\\mathbb{R}^+, \\times) \\to (\\mathbb{R}, +)$, since $\\ln(xy) = \\ln x + \\ln y$.

**Traps.** • "Has inverses" — always ask which operation. The additive inverse of 5 in $\\mathbb{Z}_8$ is 3; the multiplicative inverse of 5 is 5 (since $25 \\equiv 1$). • $\\mathbb{Z}_n$ is ALWAYS a commutative ring; it's a field only for prime $n$. • Closure counterexamples are one-liners: odd $-$ odd $=$ even shows the odds aren't closed under subtraction.

**Worked example.** Is $\\mathbb{Z}_{11}$ a field? 11 is prime, so yes — e.g. the inverse of 4 is 3 because $4 \\cdot 3 = 12 \\equiv 1 \\pmod{11}$. Is $\\mathbb{Z}_{12}$? No: $3 \\cdot 4 = 12 \\equiv 0$, a pair of zero divisors, so neither 3 nor 4 can be invertible.`,
  },
  "2.2": {
    code: "2.2",
    title: "Polynomial Equations and Inequalities",
    body: `**Core facts.** **Fundamental Theorem of Algebra**: a degree-$n$ polynomial has exactly $n$ complex roots with multiplicity. Real coefficients force non-real roots into **conjugate pairs** — so odd degree guarantees a real root. **Remainder theorem**: dividing $p(x)$ by $(x - k)$ leaves remainder $p(k)$; **factor theorem**: $p(k) = 0 \\iff (x - k)$ is a factor. **Rational root theorem**: any rational root $\\frac{p}{q}$ (lowest terms) has $p \\mid$ constant term and $q \\mid$ leading coefficient.

**Vieta's formulas.** For $ax^2 + bx + c$: sum $= -\\frac{b}{a}$, product $= \\frac{c}{a}$. For $ax^3 + bx^2 + cx + d$: sum $= -\\frac{b}{a}$, product $= -\\frac{d}{a}$ (signs alternate). **Discriminant** $b^2 - 4ac$: positive → two real roots, zero → repeated, negative → conjugate pair.

**Inequalities.** $|A| < c \\iff -c < A < c$ (one interval); $|A| > c \\iff A > c$ or $A < -c$ (two rays). For polynomial/rational inequalities: find all zeros and undefined points, test signs between them.

**Traps.** • Dividing an equation by $x$ discards the root $x = 0$ — factor instead. • Rational equations: multiplying by a denominator can create **extraneous roots**; always check candidates against the original domain. • Flipping the inequality when multiplying by a negative. • "$kx^2 + \\ldots$ has two real roots" questions: remember to exclude $k = 0$ (not a quadratic).

**Worked example.** Solve $x^3 = 4x$. Move everything left: $x^3 - 4x = x(x-2)(x+2) = 0$, so $x \\in \\{0, 2, -2\\}$ — three roots, and dividing by $x$ at the start would have silently lost one.`,
  },
  "2.3": {
    code: "2.3",
    title: "Functions",
    body: `**Core facts.** A function is **one-to-one** if distinct inputs give distinct outputs (horizontal line test) — exactly the condition for an inverse to exist. Domain of $f^{-1}$ = range of $f$. To find an inverse: set $y = f(x)$, solve for $x$, swap. $f^{-1}$ means inverse under composition, NOT $\\frac{1}{f}$.

**Composition** $(f \\circ g)(x) = f(g(x))$ — apply the inner function first, and in general $f \\circ g \\ne g \\circ f$.

**Transformations.** $f(x - h) + k$: right $h$, up $k$ (horizontal changes are counterintuitive); $f(-x)$ reflects across the $y$-axis, $-f(x)$ across the $x$-axis; $f(cx)$ compresses horizontally by $c$. Even: $f(-x) = f(x)$; odd: $f(-x) = -f(x)$.

**Exponentials and logs.** $\\log_b x = y \\iff x = b^y$. Laws: $\\log(xy) = \\log x + \\log y$, $\\log(x^n) = n\\log x$, change of base $\\log_b x = \\frac{\\ln x}{\\ln b}$. Exponential decay with half-life $h$: after time $t$ the fraction $\\left(\\frac{1}{2}\\right)^{t/h}$ remains — it multiplies, never subtracts.

**Sequences and series.** Arithmetic: $a_n = a_1 + (n-1)d$. Geometric: $a_n = a_1 r^{n-1}$; infinite sum $\\frac{a}{1 - r}$ only when $|r| < 1$ — and watch the sign: $r = -\\frac{1}{3}$ makes the denominator $1 + \\frac{1}{3}$.

**Traps.** • Domain questions: collect ALL constraints (radicands $\\ge 0$, denominators $\\ne 0$). • Log equations: candidates making any log argument $\\le 0$ are extraneous. • $a_{10}$ takes NINE steps from $a_1$, not ten.

**Worked example.** $f(x) = \\frac{2x+3}{x-1}$. Inverse: $y(x-1) = 2x + 3 \\Rightarrow x(y - 2) = y + 3 \\Rightarrow f^{-1}(x) = \\frac{x+3}{x-2}$. Note $f$ never equals 2 (its horizontal asymptote), matching the hole at $x = 2$ in the inverse's domain.`,
  },
  "2.4": {
    code: "2.4",
    title: "Linear Algebra",
    body: `**Core facts.** Dot product $\\mathbf{u} \\cdot \\mathbf{v} = u_1v_1 + u_2v_2 = |\\mathbf{u}||\\mathbf{v}|\\cos\\theta$; vectors are **perpendicular iff the dot product is 0**, parallel iff one is a scalar multiple of the other. Norm: $|\\mathbf{u}| = \\sqrt{\\mathbf{u} \\cdot \\mathbf{u}}$.

**Matrices.** Multiply row-by-column; matrix multiplication is associative but **not commutative**. $\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc$, and the $2\\times 2$ inverse is $\\frac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$ (swap the diagonal, negate the off-diagonal, divide by the determinant).

**Systems.** $A\\mathbf{x} = \\mathbf{b}$ has a unique solution iff $\\det A \\ne 0$. When $\\det A = 0$ the lines are parallel (no solution) or identical (infinitely many) — compare the constants to tell which.

**Linear transformations.** The columns of the matrix are the images of the basis vectors $(1,0)$ and $(0,1)$ — this rebuilds any transformation matrix from scratch. Rotation by $\\theta$ CCW: $\\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}$. Composition = matrix product with the FIRST transformation on the RIGHT: doing $T_1$ then $T_2$ is $M_2 M_1$. $|\\det|$ = area scaling factor; negative determinant = orientation flips.

**Traps.** • Entrywise reciprocals are NOT the matrix inverse. • $M_1 M_2$ vs $M_2 M_1$ order in compositions. • $\\det = 0$ means "not exactly one solution," not automatically "no solution."

**Worked example.** Solve $3x + 2y = 7$, $x + 4y = 9$. $\\det = 12 - 2 = 10 \\ne 0$, so one solution: $A^{-1} = \\frac{1}{10}\\begin{pmatrix} 4 & -2 \\\\ -1 & 3 \\end{pmatrix}$ gives $(x, y) = (1, 2)$. Check both equations. ✓`,
  },
  "3.1": {
    code: "3.1",
    title: "Plane Euclidean Geometry",
    body: `**Core facts.** Triangle angle sum $180^\\circ$; an **exterior angle equals the sum of the two remote interior angles**. Triangle inequality: each side strictly between the difference and sum of the others. Congruence: SSS, SAS, ASA, AAS, HL — and **SSA is NOT valid** (the ambiguous case). Similar figures: lengths scale by $k$, areas by $k^2$.

**Parallel lines.** A transversal makes alternate interior angles congruent and co-interior angles supplementary — this is the engine of the angle-sum proof and most angle-chasing problems. Triangle proportionality: a line parallel to one side splits the other two proportionally: $\\frac{AD}{DB} = \\frac{AE}{EC}$.

**Circles.** Inscribed angle $=$ half the central angle on the same arc (so angles in a semicircle are right). A tangent is perpendicular to the radius at the point of contact — tangent-length problems are Pythagorean-theorem problems. Arc length $= \\frac{\\theta}{360} \\cdot 2\\pi r$; sector area $= \\frac{\\theta}{360} \\cdot \\pi r^2$.

**Polygons.** Interior angle sum $(n-2)180^\\circ$; exterior angles of ANY convex polygon total $360^\\circ$; regular $n$-gon: each interior angle $= 180^\\circ - \\frac{360^\\circ}{n}$.

**Traps.** • Similar triangles: matching the RIGHT ratio of areas ($k^2$, not $k$). • Parallelogram diagonals bisect each other but are congruent only in rectangles. • Isosceles: the congruent angles face the congruent sides.

**Worked example.** Point $P$ is 13 from the center of a circle of radius 5; tangent length from $P$? The radius to the tangency point is perpendicular to the tangent, giving a right triangle with hypotenuse 13 and leg 5: $\\sqrt{169 - 25} = 12$.`,
  },
  "3.2": {
    code: "3.2",
    title: "Coordinate Geometry",
    body: `**Core facts.** Distance $\\sqrt{(\\Delta x)^2 + (\\Delta y)^2}$; midpoint averages coordinates. Parallel lines share slope; perpendicular slopes multiply to $-1$. The perpendicular bisector of $\\overline{AB}$ = all points equidistant from $A$ and $B$.

**Conics — identify by the squared terms.** Circle: $x^2$ and $y^2$ with EQUAL coefficients, $(x-h)^2 + (y-k)^2 = r^2$. Ellipse: both positive, different coefficients, $\\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1$ with major axis $2a$ along the larger denominator. Hyperbola: opposite signs. Parabola: only ONE variable squared; vertex form $y = a(x-h)^2 + k$ via completing the square, or $x_{vertex} = -\\frac{b}{2a}$.

**Coordinate proofs.** Place figures to exploit rigid motions: rectangle at $(0,0), (w,0), (w,h), (0,h)$. Then claims about lengths become distance-formula computations — that's how "diagonals of a rectangle are congruent" falls in two lines. Area from vertices: base-times-height with a horizontal base, or the shoelace formula.

**Polar coordinates.** $x = r\\cos\\theta$, $y = r\\sin\\theta$; know the axis angles ($\\theta = \\pi$ points along the negative $x$-axis).

**Traps.** • Signs in the circle equation: center $(3, -2)$ gives $(x-3)^2 + (y+2)^2$ — the sign flips. • $r^2$ on the right side, not $r$. • Vertex of $y = (x-3)^2 + 2$ is at $x = +3$. • Major axis length is $2a$, not $a$.

**Worked example.** Classify $4x^2 + 9y^2 = 36$: both squared terms positive with different coefficients → ellipse; dividing by 36 gives $\\frac{x^2}{9} + \\frac{y^2}{4} = 1$, so $a = 3$ and the major axis has length 6 along the $x$-axis.`,
  },
  "3.3": {
    code: "3.3",
    title: "Three-Dimensional Geometry",
    body: `**Core facts.** Volumes: prism/cylinder $= (\\text{base area}) \\times h$; pyramid/cone $= \\frac{1}{3}(\\text{base area}) \\times h$ — the $\\frac{1}{3}$ is the whole game; sphere $= \\frac{4}{3}\\pi r^3$ with surface area $4\\pi r^2$. Cylinder surfaces: lateral $2\\pi rh$, total $2\\pi rh + 2\\pi r^2$.

**Scaling.** Under a similarity with factor $k$: lengths $\\times k$, areas $\\times k^2$, volumes $\\times k^3$. Doubling ONLY the radius of a cylinder multiplies volume by 4 (the $r$ is squared); doubling every dimension multiplies it by 8.

**Cavalieri's principle.** Equal heights + equal cross-sectional area at every level ⟹ equal volumes — nothing about congruence or surface area. It's how the sphere volume is derived and a favorite conceptual question.

**Cross sections and revolution.** Plane parallel to a cone's base: circle; through the apex, perpendicular to base: triangle; tilted (missing the apex): ellipse or parabola. Rotating a rectangle about a side sweeps a cylinder; a right triangle about a leg sweeps a cone; a semicircle about its diameter sweeps a sphere.

**Composite solids.** Add the pieces: a silo (cylinder + hemisphere) is $\\pi r^2 h + \\frac{2}{3}\\pi r^3$ — half of $\\frac{4}{3}\\pi r^3$, a classic slip.

**Traps.** • Sphere volume ($\\frac{4}{3}\\pi r^3$) vs surface area ($4\\pi r^2$) — at $r = 3$ they coincide numerically, which is why exams love $r = 3$. • Forgetting the $\\frac{1}{3}$ on cones/pyramids gives the circumscribing prism instead.

**Worked example.** Cone with $r = 4$, $h = 9$: $V = \\frac{1}{3}\\pi(16)(9) = 48\\pi$ — exactly a third of the matching cylinder's $144\\pi$.`,
  },
  "3.4": {
    code: "3.4",
    title: "Transformational Geometry",
    body: `**Core facts.** The **isometries** (distance-preserving maps) of the plane are exactly: translations, rotations, reflections, and glide reflections. Dilations preserve angles and shape but scale lengths by $|k|$ — similarity, not congruence. Coordinate rules to know cold: $90^\\circ$ CCW $(x,y) \\mapsto (-y, x)$; $90^\\circ$ CW $(x,y) \\mapsto (y, -x)$; $180^\\circ$ $(x,y) \\mapsto (-x,-y)$; reflections: $x$-axis $(x,-y)$, $y$-axis $(-x,y)$, line $y = x$ $(y,x)$.

**Compositions — the theorems the exam tests.** Two reflections across PARALLEL lines = a translation by twice the distance between them, perpendicular to the lines. Two reflections across INTERSECTING lines = a rotation about the intersection by twice the angle between them. Reflection followed by a translation parallel to the mirror = glide reflection. Orientation bookkeeping settles classification instantly: each reflection reverses orientation, so an even number of reflections preserves it (translation/rotation), an odd number reverses it (reflection/glide).

**Symmetry.** A regular $n$-gon has $n$ reflection lines and rotational symmetry of order $n$ (rotations by multiples of $\\frac{360^\\circ}{n}$).

**Traps.** • "Twice the distance / twice the angle" — forgetting the factor 2 is the standard distractor. • A composition of two reflections can never BE a reflection (orientation). • Dilations: angles unchanged, perimeter $\\times k$, area $\\times k^2$.

**Worked example.** Reflect across $x = -1$, then across $x = 1$: parallel mirrors 2 apart ⟹ translation by $2 \\cdot 2 = 4$ units, in the direction from the first line toward the second ($+x$). Verify with the origin: first reflection sends $(0,0) \\to (-2, 0)$, second sends $(-2,0) \\to (4, 0)$. ✓`,
  },
  "4.1": {
    code: "4.1",
    title: "Probability",
    body: `**Core facts.** Probability lives on a sample space of **equally likely outcomes** — count them carefully. Addition rule: $P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$. Conditional probability: $P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}$ — restrict the world to $B$. **Independence** means $P(A \\cap B) = P(A)P(B)$; sampling WITHOUT replacement breaks independence (second draw: $\\frac{r-1}{n-1}$).

**Counting.** Order matters → permutations $P(n,k) = \\frac{n!}{(n-k)!}$; order doesn't (committees!) → combinations $\\binom{n}{k} = \\frac{n!}{k!(n-k)!}$. Binomial probability: $P(k \\text{ successes in } n) = \\binom{n}{k}p^k(1-p)^{n-k}$.

**Expected value.** $E = \\sum p_i x_i$ — probability-weighted average. For games, compute the NET: subtract the cost of playing. A fair game has net $E = 0$.

**Geometric probability.** Uniform over a region ⟹ probability = favorable area ÷ total area.

**Traps.** • Two dice: 36 ordered outcomes; the 11 possible SUMS are not equally likely. • "At least one" → complement: $1 - P(\\text{none})$. • Confusing $P(A \\mid B)$ with $P(B \\mid A)$ or with $P(A \\cap B)$ — in a two-way table, the condition picks the ROW (or column) you divide by. • Squaring $\\frac{r}{n}$ for two draws without replacement.

**Worked example.** Bag: 4 red, 3 blue; draw two without replacement. $P(\\text{both red}) = \\frac{4}{7} \\cdot \\frac{3}{6} = \\frac{2}{7}$. With replacement it would be $\\left(\\frac{4}{7}\\right)^2 = \\frac{16}{49}$ — different, because independence fails without replacement.`,
  },
  "4.2": {
    code: "4.2",
    title: "Statistics",
    body: `**Core facts.** Mean uses every value; **median resists outliers** — a high outlier drags the mean above the median (right skew). Spread: standard deviation (about the mean) and IQR $= Q_3 - Q_1$; outlier fences at $Q_1 - 1.5\\,\\text{IQR}$ and $Q_3 + 1.5\\,\\text{IQR}$.

**Transforming data.** Add $c$ to every value: mean shifts by $c$, SD unchanged. Multiply by $k$: mean $\\times k$, SD $\\times |k|$. Combined $kx + c$: mean $km + c$, SD $ks$. This single fact settles a whole family of questions.

**Normal distribution.** $z = \\frac{x - \\mu}{\\sigma}$ counts standard deviations from the mean. **Empirical rule**: about $68\\%$ within $1\\sigma$, $95\\%$ within $2\\sigma$, $99.7\\%$ within $3\\sigma$. Slice symmetrically: above $\\mu + 2\\sigma$ lies $\\frac{100 - 95}{2} = 2.5\\%$; between $\\mu + \\sigma$ and $\\mu + 2\\sigma$ lies $47.5 - 34 = 13.5\\%$.

**Study design.** A simple random sample gives every member an equal chance. Voluntary response and convenience samples are biased toward strong opinions / easy reach. **Correlation is not causation** — lurking variables; and $r$ measures only LINEAR association, with $r^2$ (not $r$) the fraction of variance explained.

**Traps.** • SD never changes under a shift — adding 5 to every score can't spread them out. • Appending a value AT the mean shrinks SD; only far values grow it. • $r = -0.9$ is a STRONG relationship (strength = $|r|$).

**Worked example.** Scores: mean 70, SD 10. Every score is doubled and then 5 is added: new mean $2(70) + 5 = 145$, new SD $2(10) = 20$ — the $+5$ never touches the spread. A student originally at 85 had $z = \\frac{85 - 70}{10} = 1.5$, and at $2(85)+5 = 175$ still has $z = \\frac{175 - 145}{20} = 1.5$: linear transformations preserve $z$-scores.`,
  },
};
