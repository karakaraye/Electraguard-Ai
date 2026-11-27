import type { ReactNode } from "react";

/** Inline: `code` becomes <code>; everything else stays text. React escapes it, so nothing is ever HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/`([^`\n]+)`/).map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part));
}

/**
 * Renders approved text that carries light markdown, without changing its wording:
 * blank line = paragraph, consecutive "- " lines = list, `code` = <code>.
 * Output is built from React elements only (no HTML injection, no dangerouslySetInnerHTML).
 */
export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  for (const [blockIndex, block] of text.replace(/\r\n/g, "\n").split(/\n{2,}/).entries()) {
    let items: string[] = [];
    let prose: string[] = [];
    const flushItems = () => {
      if (items.length) out.push(<ul key={`${blockIndex}-u${out.length}`}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
      items = [];
    };
    const flushProse = () => {
      if (prose.length) out.push(<p key={`${blockIndex}-p${out.length}`}>{inline(prose.join("\n"))}</p>);
      prose = [];
    };
    for (const line of block.split("\n")) {
      const bullet = /^\s*-\s+(.*\S)\s*$/.exec(line);
      if (bullet) {
        flushProse();
        items.push(bullet[1]);
      } else if (line.trim()) {
        flushItems();
        prose.push(line.trim());
      }
    }
    flushItems();
    flushProse();
  }
  return <>{out}</>;
}
