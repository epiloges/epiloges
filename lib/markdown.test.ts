import { describe, expect, it } from "vitest";
import { markdownToText, parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("keeps plain prose as paragraphs, exactly as the existing posts are written", () => {
    const blocks = parseMarkdown("Πρώτη παράγραφος.\nΔεύτερη γραμμή.\n\nΔεύτερη παράγραφος.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "paragraph", children: [{ type: "text", text: "Πρώτη παράγραφος.\nΔεύτερη γραμμή." }] });
  });

  it("parses headings, lists and a pipe table", () => {
    const blocks = parseMarkdown(["## Πίνακας", "", "| EU | UK |", "|----|----|", "| 36 | 3 |", "| 37 | 4 |", "", "- ένα", "- δύο", "", "1. πρώτο", "2. δεύτερο"].join("\n"));
    expect(blocks.map((b) => b.type)).toEqual(["heading", "table", "list", "list"]);
    const table = blocks[1];
    if (table.type !== "table") throw new Error();
    expect(table.header.map((c) => c[0])).toEqual([{ type: "text", text: "EU" }, { type: "text", text: "UK" }]);
    expect(table.rows).toHaveLength(2);
    const list = blocks[2];
    if (list.type !== "list") throw new Error();
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    const ordered = blocks[3];
    if (ordered.type !== "list") throw new Error();
    expect(ordered.ordered).toBe(true);
  });

  it("parses bold, italic and links, and refuses unsafe link targets", () => {
    expect(parseInline("a **b** *c* [d](/size-guide)")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "link", href: "/size-guide", children: [{ type: "text", text: "d" }] },
    ]);
    expect(parseInline("[x](javascript:void)")).toEqual([{ type: "text", text: "x" }]);
  });

  it("never emits HTML — angle brackets are text", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>");
    expect(blocks).toEqual([{ type: "paragraph", children: [{ type: "text", text: "<script>alert(1)</script>" }] }]);
  });

  it("flattens to text for excerpts", () => {
    expect(markdownToText("## Τίτλος\n\n- **ένα**\n- δύο")).toBe("Τίτλος\n\n• ένα\n• δύο");
  });
});
