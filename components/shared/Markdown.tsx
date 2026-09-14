import Link from "next/link";
import { parseMarkdown, type Inline } from "@/lib/markdown";

/** Renders the Markdown subset lib/markdown.ts understands as real elements. Server component; no HTML strings. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={index} className="font-heading mt-10 text-2xl md:text-3xl">
                <InlineNodes nodes={block.children} />
              </h2>
            ) : (
              <h3 key={index} className="mt-8 text-lg font-medium">
                <InlineNodes nodes={block.children} />
              </h3>
            );
          case "paragraph":
            return (
              <p key={index} className="mt-5 leading-relaxed whitespace-pre-line">
                <InlineNodes nodes={block.children} />
              </p>
            );
          case "list": {
            const items = block.items.map((item, i) => (
              <li key={i}>
                <InlineNodes nodes={item} />
              </li>
            ));
            return block.ordered ? (
              <ol key={index} className="mt-5 list-decimal space-y-2 pl-6 leading-relaxed">
                {items}
              </ol>
            ) : (
              <ul key={index} className="mt-5 list-disc space-y-2 pl-6 leading-relaxed">
                {items}
              </ul>
            );
          }
          case "table":
            return (
              <div key={index} className="mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {block.header.map((cell, i) => (
                        <th key={i} className="border-b border-luxe-black py-2 pr-4 text-left font-medium">
                          <InlineNodes nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} className="border-b border-border py-2 pr-4 align-top">
                            <InlineNodes nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return node.text;
          case "bold":
            return (
              <strong key={index} className="font-medium text-luxe-black">
                <InlineNodes nodes={node.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={index}>
                <InlineNodes nodes={node.children} />
              </em>
            );
          case "link":
            return (
              <Link key={index} href={node.href} className="underline underline-offset-2">
                <InlineNodes nodes={node.children} />
              </Link>
            );
        }
      })}
    </>
  );
}
