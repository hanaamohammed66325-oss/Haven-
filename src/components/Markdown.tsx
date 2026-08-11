"use client";

// Tiny, dependency-free Markdown renderer — just enough for the legal pages
// (headings, paragraphs, ordered/unordered lists with one nesting level, bold,
// inline code, and horizontal rules). No third-party markdown library is in the
// project and we can't add one, so this covers exactly the constructs the
// policy documents use. It is NOT a general-purpose Markdown parser.

import React from "react";

/** Inline formatting: **bold** and `code`. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${n}`} className="font-semibold" style={{ color: "var(--color-ink)" }}>
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      // Inline code (e.g. support@havenstudent.com) — force LTR so it reads
      // correctly even inside RTL Arabic text.
      nodes.push(
        <code
          key={`${keyPrefix}-c${n}`}
          className="rounded px-1.5 py-0.5 text-[0.85em]"
          style={{
            background: "var(--color-primary-soft)",
            color: "var(--color-primary)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            direction: "ltr",
            unicodeBidi: "embed",
          }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = m.index + tok.length;
    n++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const isListLine = (l: string) => /^\s*(?:[-*]|\d+\.)\s+/.test(l);
const isIndentedText = (l: string) => /^\s+\S/.test(l);

/** Build one list block (ordered or unordered) with a single level of nesting. */
function renderList(listLines: string[], key: number): React.ReactNode {
  const first = listLines[0];
  const baseIndent = first.match(/^(\s*)/)?.[1].length ?? 0;
  const ordered = /^\s*\d+\.\s+/.test(first);

  type Item = { content: string; children: string[] };
  const items: Item[] = [];

  for (const raw of listLines) {
    const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
    const m = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (!m) {
      // wrapped continuation line — append to the current item
      if (items.length) items[items.length - 1].content += " " + raw.trim();
      continue;
    }
    if (indent > baseIndent && items.length) {
      items[items.length - 1].children.push(m[1]);
    } else {
      items.push({ content: m[1], children: [] });
    }
  }

  const listCls = ordered
    ? "list-decimal ps-6 mb-4 space-y-2"
    : "list-disc ps-6 mb-4 space-y-1.5";
  const inner = items.map((it, idx) => (
    <li key={idx} className="text-[15px] leading-relaxed">
      {renderInline(it.content, `li${key}-${idx}`)}
      {it.children.length > 0 && (
        <ul className="list-[circle] ps-6 mt-1.5 space-y-1">
          {it.children.map((c, ci) => (
            <li key={ci} className="text-[15px] leading-relaxed">
              {renderInline(c, `li${key}-${idx}-${ci}`)}
            </li>
          ))}
        </ul>
      )}
    </li>
  ));

  return ordered ? (
    <ol key={key} className={listCls} style={{ color: "var(--color-ink)" }}>{inner}</ol>
  ) : (
    <ul key={key} className={listCls} style={{ color: "var(--color-ink)" }}>{inner}</ul>
  );
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const inline = renderInline(h[2], `h${key}`);
      if (level <= 1) {
        blocks.push(<h1 key={key++} className="font-display text-[28px] leading-tight mt-8 mb-3" style={{ color: "var(--color-ink)" }}>{inline}</h1>);
      } else if (level === 2) {
        blocks.push(<h2 key={key++} className="font-display text-2xl mt-8 mb-3" style={{ color: "var(--color-ink)" }}>{inline}</h2>);
      } else {
        blocks.push(<h3 key={key++} className="font-display text-xl mt-7 mb-2.5" style={{ color: "var(--color-ink)" }}>{inline}</h3>);
      }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-6" style={{ borderColor: "var(--color-border)" }} />);
      i++;
      continue;
    }

    // List block (consumes blank lines between items so loose lists stay one list)
    if (isListLine(line)) {
      const listLines: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (isListLine(cur) || isIndentedText(cur)) { listLines.push(cur); i++; continue; }
        if (cur.trim() === "") {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j < lines.length && (isListLine(lines[j]) || isIndentedText(lines[j]))) { i = j; continue; }
        }
        break;
      }
      blocks.push(renderList(listLines, key++));
      continue;
    }

    // Paragraph (consecutive non-blank lines → one paragraph, soft breaks kept)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^-{3,}\s*$/.test(lines[i]) &&
      !isListLine(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key++} className="text-[15px] leading-relaxed mb-4" style={{ color: "var(--color-ink)" }}>
        {para.flatMap((pl, idx) =>
          idx === 0
            ? renderInline(pl, `p${key}-${idx}`)
            : [<br key={`br${key}-${idx}`} />, ...renderInline(pl, `p${key}-${idx}`)]
        )}
      </p>
    );
  }

  return <div className={className}>{blocks}</div>;
}
