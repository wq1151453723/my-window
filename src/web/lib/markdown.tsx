import type { ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = (text ?? "").replace(/\r/g, "").split(/\n{2,}/);
  const nodes: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return;
    const lines = trimmed.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      nodes.push(
        <ul key={bi}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.trim().slice(2), `li-${bi}-${li}`)}</li>
          ))}
        </ul>
      );
      return;
    }
    if (lines.every((l) => l.trim().startsWith("> "))) {
      nodes.push(
        <blockquote key={bi}>
          {lines.map((l, li) => (
            <span key={li} className="inline-block mr-2">{renderInline(l.trim().slice(2), `bq-${bi}-${li}`)}</span>
          ))}
        </blockquote>
      );
      return;
    }
    if (trimmed.startsWith("### ")) {
      nodes.push(<h3 key={bi}>{renderInline(trimmed.slice(4), `h3-${bi}`)}</h3>);
      return;
    }
    if (trimmed.startsWith("## ")) {
      nodes.push(<h2 key={bi}>{renderInline(trimmed.slice(3), `h2-${bi}`)}</h2>);
      return;
    }
    if (trimmed.startsWith("# ")) {
      nodes.push(<h2 key={bi}>{renderInline(trimmed.slice(2), `h1-${bi}`)}</h2>);
      return;
    }
    nodes.push(
      <p key={bi}>
        {lines.map((l, li) => (
          <span key={li}>
            {renderInline(l, `p-${bi}-${li}`)}
            {li < lines.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    );
  });
  return <div className={className}>{nodes}</div>;
}