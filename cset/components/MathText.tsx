"use client";

import katex from "katex";
import { useMemo } from "react";

/**
 * Renders content-authored text: plain text with $inline$ and $$display$$
 * LaTeX, **bold**, and blank-line paragraph breaks. All non-math text is
 * HTML-escaped before assembly, so authored content can't inject markup.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>"); // only plain text goes through here — KaTeX output must keep its newlines
}

function tex(src: string, displayMode: boolean): string {
  return katex.renderToString(src, { throwOnError: false, displayMode });
}

function renderInlineMath(text: string): string {
  let out = "";
  let rest = text;
  while (rest.length > 0) {
    const start = rest.indexOf("$");
    const end = start === -1 ? -1 : rest.indexOf("$", start + 1);
    if (start === -1 || end === -1) {
      out += escapeHtml(rest);
      break;
    }
    out += escapeHtml(rest.slice(0, start));
    out += tex(rest.slice(start + 1, end), false);
    rest = rest.slice(end + 1);
  }
  return out;
}

/** Bold first (bold spans may contain math), then inline math inside each part. */
function renderInline(text: string): string {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts
    .map((p, i) => (i % 2 === 1 ? `<strong>${renderInlineMath(p)}</strong>` : renderInlineMath(p)))
    .join("");
}

function renderBlock(text: string): string {
  // Handle $$...$$ display blocks within a paragraph.
  const pieces = text.split(/\$\$([\s\S]+?)\$\$/g);
  return pieces.map((p, i) => (i % 2 === 1 ? tex(p, true) : renderInline(p))).join("");
}

export function renderMathHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${renderBlock(para)}</p>`)
    .join("");
}

export default function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMathHtml(text), [text]);
  return <div className={`space-y-2 leading-relaxed ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
