/**
 * The subset of Markdown a journal article needs, parsed into a tree the page renders as
 * real elements — an `<h2>` a crawler can read as a heading, a `<table>` a size chart can
 * live in — rather than one `<p>` with line breaks, which is what article content was.
 *
 * Deliberately small and dependency-free: headings (##, ###), paragraphs, bullet and
 * numbered lists, pipe tables, **bold**, *italic*, and [links](url). Nothing here ever
 * produces raw HTML, so there is no HTML to sanitise; the renderer builds elements and
 * React escapes the text. Plain prose with blank lines between paragraphs — the shape
 * every existing post has — renders exactly as before.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const SAFE_HREF = /^(https?:\/\/|\/|mailto:|tel:)/i;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/;
  while (rest.length) {
    const match = pattern.exec(rest);
    if (!match) {
      out.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) out.push({ type: "text", text: rest.slice(0, match.index) });
    if (match[1] !== undefined) out.push({ type: "bold", children: parseInline(match[1]) });
    else if (match[2] !== undefined) out.push({ type: "italic", children: parseInline(match[2]) });
    else if (SAFE_HREF.test(match[4])) out.push({ type: "link", href: match[4], children: parseInline(match[3]) });
    else out.push({ type: "text", text: match[3] });
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isSeparatorRow = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length === 2 ? 2 : 3, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    if (line.trim().startsWith("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.+)$/;
    const numbered = /^\s*\d+[.)]\s+(.+)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = (ordered ? numbered : bullet).exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1]));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph: consecutive non-blank lines that are not something else. A single line
    // break inside stays a break (whitespace-pre-line behaviour the old posts relied on).
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{2,3}\s/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !lines[i].trim().startsWith("|")) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}

/** Plain text of an article, for excerpts and search — markup dropped, structure kept as lines. */
export function markdownToText(source: string): string {
  const inline = (nodes: Inline[]): string => nodes.map((n) => (n.type === "text" ? n.text : inline(n.children))).join("");
  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
          return inline(block.children);
        case "list":
          return block.items.map((item) => `• ${inline(item)}`).join("\n");
        case "table":
          return [block.header, ...block.rows].map((row) => row.map(inline).join(" | ")).join("\n");
      }
    })
    .join("\n\n");
}
