/**
 * 极简 Markdown → 内联样式 HTML（只支持正文实际用到的语法）。
 * 公众号会剥离 <style> 与 class，所以样式必须内联。
 */
function esc(t: string): string {
  return (t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(t: string): string {
  return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong style=\"color:#17130e;font-weight:600;\">$1</strong>");
}

export function markdownToHtml(md: string, ink = "#3f3f3f"): string {
  const blocks = (md ?? "").replace(/\r/g, "").split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      out.push(
        `<ul style="margin:0 0 1.35em;padding-left:1.1em;list-style:none;">` +
          lines
            .map((l) => `<li style="margin:0 0 0.6em;font-size:16px;line-height:1.75;color:${ink};">· ${inline(l.trim().slice(2))}</li>`)
            .join("") +
          `</ul>`
      );
      continue;
    }
    if (lines.every((l) => l.trim().startsWith("> "))) {
      out.push(
        `<blockquote style="margin:1.3em 0;padding-left:1em;border-left:3px solid #d5cab6;color:#6a6153;font-size:15px;line-height:1.8;">` +
          lines.map((l) => inline(l.trim().slice(2))).join(" ") +
          `</blockquote>`
      );
      continue;
    }
    if (trimmed.startsWith("### ")) {
      out.push(`<h3 style="margin:1.6em 0 0.6em;font-size:17px;font-weight:700;color:#17130e;">${inline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      out.push(`<h2 style="margin:1.8em 0 0.7em;font-size:18px;font-weight:700;color:#17130e;">${inline(trimmed.slice(3))}</h2>`);
      continue;
    }
    out.push(
      `<p style="margin:0 0 1.35em;font-size:16px;line-height:1.85;color:${ink};letter-spacing:0.3px;">` +
        lines.map((l) => inline(l)).join("<br/>") +
        `</p>`
    );
  }
  return out.join("\n");
}