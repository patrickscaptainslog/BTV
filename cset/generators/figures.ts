/**
 * Small SVG figure builders for geometry items. Figures use currentColor
 * for strokes/labels so they work in light and dark themes, with a fixed
 * sky accent for highlighted marks. Emitted inline into item JSON.
 */

const ACCENT = "#0ea5e9";

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

function svg(viewBox: string, content: string): string {
  return `<svg viewBox="${viewBox}" role="img" style="max-width:340px;width:100%;height:auto" fill="none" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

function line(x1: number, y1: number, x2: number, y2: number, opts = ""): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="1.8" ${opts}/>`;
}

function label(x: number, y: number, text: string, opts = ""): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="currentColor" font-size="14" font-family="sans-serif" text-anchor="middle" ${opts}>${text}</text>`;
}

function accentLabel(x: number, y: number, text: string): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${ACCENT}" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">${text}</text>`;
}

function angleArc(cx: number, cy: number, startDeg: number, endDeg: number, r: number, accent = false): string {
  const x1 = cx + r * Math.cos(deg2rad(startDeg));
  const y1 = cy + r * Math.sin(deg2rad(startDeg));
  const x2 = cx + r * Math.cos(deg2rad(endDeg));
  const y2 = cy + r * Math.sin(deg2rad(endDeg));
  let sweep = endDeg - startDeg;
  while (sweep < 0) sweep += 360;
  const large = sweep > 180 ? 1 : 0;
  return `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${accent ? ACCENT : "currentColor"}" stroke-width="${accent ? 2 : 1.4}"/>`;
}

/**
 * Triangle ABC with interior angles A and B given (degrees). Side AB is the
 * base; the side through A-C is extended past C to show the exterior angle,
 * marked "?".
 */
export function triangleExteriorFigure(A: number, B: number): string {
  const base = 260;
  const ax = 30;
  const ay = 190;
  const bx = ax + base;
  const by = ay;
  // Intersection via law of sines: |AC| = base·sin(B)/sin(A+B)
  const ac = (base * Math.sin(deg2rad(B))) / Math.sin(deg2rad(A + B));
  const cx = ax + ac * Math.cos(deg2rad(A));
  const cy = ay - ac * Math.sin(deg2rad(A));
  // Extend A→C past C
  const ux = (cx - ax) / ac;
  const uy = (cy - ay) / ac;
  const ex = cx + ux * 55;
  const ey = cy + uy * 55;
  // Angle directions at C (degrees, SVG coords): toward A and toward B
  const dirCA = (Math.atan2(ay - cy, ax - cx) * 180) / Math.PI;
  const dirCB = (Math.atan2(by - cy, bx - cx) * 180) / Math.PI;
  const dirExt = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
  // exterior angle between extension ray and CB
  const midExt = (dirExt + dirCB) / 2;
  return svg(
    "0 0 340 230",
    [
      line(ax, ay, bx, by),
      line(ax, ay, cx, cy),
      line(bx, by, cx, cy),
      line(cx, cy, ex, ey, 'stroke-dasharray="5 4"'),
      angleArc(ax, ay, -A, 0, 26),
      angleArc(bx, by, 180, 180 + B, 26),
      angleArc(cx, cy, dirExt, dirCB, 18, true),
      label(ax - 8, ay + 16, "A"),
      label(bx + 8, by + 16, "B"),
      label(cx, cy - 12, "C"),
      label(ax + 44, ay - 8, `${A}°`),
      label(bx - 42, by - 8, `${B}°`),
      accentLabel(cx + 30 * Math.cos(deg2rad(midExt)), cy + 30 * Math.sin(deg2rad(midExt)) + 4, "?"),
    ].join("")
  );
}

/** Circle with a central angle and an inscribed angle on the same arc. */
export function inscribedAngleFigure(central: number): string {
  const cx = 170;
  const cy = 130;
  const r = 95;
  // Intercepted arc at the bottom, symmetric about 90° (SVG: down)
  const a1 = 90 - central / 2;
  const a2 = 90 + central / 2;
  const p1 = [cx + r * Math.cos(deg2rad(a1)), cy + r * Math.sin(deg2rad(a1))];
  const p2 = [cx + r * Math.cos(deg2rad(a2)), cy + r * Math.sin(deg2rad(a2))];
  const v = [cx, cy - r]; // top of circle
  const dirV1 = (Math.atan2(p1[1] - v[1], p1[0] - v[0]) * 180) / Math.PI;
  const dirV2 = (Math.atan2(p2[1] - v[1], p2[0] - v[0]) * 180) / Math.PI;
  return svg(
    "0 0 340 260",
    [
      `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="currentColor" stroke-width="1.8"/>`,
      line(cx, cy, p1[0], p1[1]),
      line(cx, cy, p2[0], p2[1]),
      line(v[0], v[1], p1[0], p1[1], `stroke="${ACCENT}" stroke-width="1.8"`),
      line(v[0], v[1], p2[0], p2[1], `stroke="${ACCENT}" stroke-width="1.8"`),
      angleArc(cx, cy, a1, a2, 20),
      angleArc(v[0], v[1], Math.min(dirV1, dirV2), Math.max(dirV1, dirV2), 22, true),
      `<circle cx="${cx}" cy="${cy}" r="2.5" fill="currentColor"/>`,
      label(cx + 12, cy - 6, "O"),
      label(cx, cy + 52, `${central}°`),
      accentLabel(v[0], v[1] + 44, "?"),
      label(v[0], v[1] - 10, "V"),
    ].join("")
  );
}

/**
 * Right triangle for special-angle problems. `kind` controls the angle
 * labels; `knownLabel` marks the given side, `askLabel` the asked side.
 */
export function specialRightFigure(
  kind: "30-60-90-long" | "30-60-90-hyp" | "45-45-90",
  knownLabel: string,
  askLabel: string
): string {
  const ox = 60;
  const oy = 200; // right-angle vertex
  const w = kind === "45-45-90" ? 150 : 210; // horizontal leg
  const h = kind === "45-45-90" ? 150 : 121; // vertical leg (~tan30·210 for 30-60-90)
  const tx = ox + w;
  const vy = oy - h;
  const sq = 14;
  // For 30-60-90: 30° is at the far horizontal vertex (opposite the short
  // vertical leg); 60° at the top vertex (opposite the long horizontal leg).
  const parts = [
    line(ox, oy, tx, oy),
    line(ox, oy, ox, vy),
    line(ox, vy, tx, oy),
    `<path d="M ${ox + sq} ${oy} L ${ox + sq} ${oy - sq} L ${ox} ${oy - sq}" stroke="currentColor" stroke-width="1.4"/>`,
  ];
  if (kind === "45-45-90") {
    parts.push(label(tx - 28, oy - 10, "45°"), label(ox + 12, vy + 26, "45°"));
    // legs known, hypotenuse asked
    parts.push(label(ox + w / 2, oy + 20, knownLabel));
    parts.push(label(ox - 18, oy - h / 2, knownLabel));
    parts.push(accentLabel(ox + w / 2 + 18, vy + h / 2 - 8, askLabel));
  } else {
    parts.push(label(tx - 32, oy - 10, "30°"), label(ox + 14, vy + 28, "60°"));
    // short (vertical) leg is opposite 30° — it is the known side
    parts.push(label(ox - 16, oy - h / 2 + 4, knownLabel));
    if (kind === "30-60-90-long") {
      parts.push(accentLabel(ox + w / 2, oy + 20, askLabel));
    } else {
      parts.push(accentLabel(ox + w / 2 + 26, vy + h / 2 - 10, askLabel));
    }
  }
  return svg("0 0 300 230", parts.join(""));
}

/** Coordinate grid with labeled points; optionally a dashed segment between the first two. */
export function pointsGridFigure(points: Array<{ x: number; y: number; label: string }>, segment = false): string {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(0, ...xs) - 1;
  const maxX = Math.max(0, ...xs) + 1;
  const minY = Math.min(0, ...ys) - 1;
  const maxY = Math.max(0, ...ys) + 1;
  const unit = Math.min(300 / (maxX - minX), 220 / (maxY - minY));
  const px = (x: number) => 20 + (x - minX) * unit;
  const py = (y: number) => 20 + (maxY - y) * unit;
  const parts: string[] = [];
  for (let gx = Math.ceil(minX); gx <= maxX; gx++) {
    parts.push(line(px(gx), py(minY), px(gx), py(maxY), 'stroke-width="0.4" opacity="0.35"'));
  }
  for (let gy = Math.ceil(minY); gy <= maxY; gy++) {
    parts.push(line(px(minX), py(gy), px(maxX), py(gy), 'stroke-width="0.4" opacity="0.35"'));
  }
  // axes
  if (minX <= 0 && maxX >= 0) parts.push(line(px(0), py(minY), px(0), py(maxY), 'stroke-width="1.4"'));
  if (minY <= 0 && maxY >= 0) parts.push(line(px(minX), py(0), px(maxX), py(0), 'stroke-width="1.4"'));
  if (segment && points.length >= 2) {
    parts.push(
      line(px(points[0].x), py(points[0].y), px(points[1].x), py(points[1].y), `stroke="${ACCENT}" stroke-width="1.8" stroke-dasharray="5 4"`)
    );
  }
  for (const p of points) {
    parts.push(`<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="4" fill="${ACCENT}"/>`);
    parts.push(accentLabel(px(p.x), py(p.y) - 10, p.label));
  }
  const w = 40 + (maxX - minX) * unit;
  const h = 40 + (maxY - minY) * unit;
  return svg(`0 0 ${Math.ceil(w)} ${Math.ceil(h)}`, parts.join(""));
}
