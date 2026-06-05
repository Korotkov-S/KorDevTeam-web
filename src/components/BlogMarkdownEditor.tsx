"use client";

import * as React from "react";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  Link as LinkIcon,
  Code,
  SquareCode,
  ImageIcon,
  Upload,
  Quote,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const PLACEHOLDER = "Начните писать статью...";

type ToolbarAction = {
  icon: LucideIcon;
  label: string;
  run: () => void;
};

export type BlogMarkdownEditorRef = {
  insertAtCursor: (text: string) => void;
  focus: () => void;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function parseInlineMarkdown(text: string): string {
  const pattern =
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let html = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    if (match[1] !== undefined && match[2] !== undefined) {
      html += `<img src="${escapeAttr(match[2])}" alt="${escapeAttr(match[1])}">`;
    } else if (match[3] !== undefined && match[4] !== undefined) {
      html += `<a href="${escapeAttr(match[4])}">${escapeHtml(match[3])}</a>`;
    } else if (match[5] !== undefined) {
      html += `<code>${escapeHtml(match[5])}</code>`;
    } else if (match[6] !== undefined) {
      html += `<strong>${escapeHtml(match[6])}</strong>`;
    } else if (match[7] !== undefined) {
      html += `<em>${escapeHtml(match[7])}</em>`;
    }
    lastIndex = pattern.lastIndex;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html.replaceAll("\n", "<br>");
}

function isBlockStart(line: string) {
  return (
    /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*([-*+])\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*---+\s*$/.test(line)
  );
}

function markdownToEditorHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      blocks.push(`<h${level}>${parseInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push("<hr>");
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      i -= 1;
      blocks.push(`<blockquote>${parseInlineMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*+])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*[-*+]\s+(.+)\s*$/);
        if (!item) break;
        items.push(`<li>${parseInlineMarkdown(item[1])}</li>`);
        i += 1;
      }
      i -= 1;
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*\d+[.)]\s+(.+)\s*$/);
        if (!item) break;
        items.push(`<li>${parseInlineMarkdown(item[1])}</li>`);
        i += 1;
      }
      i -= 1;
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [line];
    while (i + 1 < lines.length && lines[i + 1].trim() && !isBlockStart(lines[i + 1])) {
      i += 1;
      paragraph.push(lines[i]);
    }
    blocks.push(`<p>${parseInlineMarkdown(paragraph.join("\n"))}</p>`);
  }

  return blocks.join("");
}

function nodeListToMarkdown(nodes: NodeListOf<ChildNode> | ChildNode[]) {
  return Array.from(nodes).map(nodeToMarkdown).join("");
}

function inlineNodesToMarkdown(nodes: NodeListOf<ChildNode> | ChildNode[]) {
  return Array.from(nodes).map(inlineNodeToMarkdown).join("");
}

function inlineNodeToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").replace(/\u00a0/g, " ");
  }
  if (!(node instanceof HTMLElement)) return "";

  const children = () => inlineNodesToMarkdown(node.childNodes);
  const tag = node.tagName.toLowerCase();

  if (tag === "strong" || tag === "b") return `**${children()}**`;
  if (tag === "em" || tag === "i") return `*${children()}*`;
  if (tag === "code") return `\`${node.textContent || ""}\``;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const label = children() || href;
    return href ? `[${label}](${href})` : label;
  }
  if (tag === "img") {
    const src = node.getAttribute("src") || "";
    const alt = node.getAttribute("alt") || "";
    return src ? `![${alt}](${src})` : "";
  }
  if (tag === "br") return "\n";

  return children();
}

function nodeToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || "").trim();
    return text ? `${text}\n\n` : "";
  }
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  const inline = () => inlineNodesToMarkdown(node.childNodes).trim();

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `${"#".repeat(level)} ${inline()}\n\n`;
  }
  if (tag === "p") {
    const text = inline();
    return text ? `${text}\n\n` : "";
  }
  if (tag === "blockquote") {
    const text = inline()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    return text.trim() ? `${text}\n\n` : "";
  }
  if (tag === "pre") {
    const code = node.textContent || "";
    return `\`\`\`text\n${code.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  }
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((li, index) => {
        const marker = tag === "ol" ? `${index + 1}.` : "-";
        return `${marker} ${inlineNodesToMarkdown(li.childNodes).replace(/\n+/g, " ").trim()}`;
      })
      .filter((line) => line.trim() !== "-" && !/^\d+\.\s*$/.test(line));
    return items.length ? `${items.join("\n")}\n\n` : "";
  }
  if (tag === "hr") return "---\n\n";
  if (tag === "img") return `${inlineNodeToMarkdown(node)}\n\n`;
  if (tag === "div") return nodeListToMarkdown(node.childNodes);

  const text = inline();
  return text ? `${text}\n\n` : "";
}

function editorHtmlToMarkdown(root: HTMLElement): string {
  return nodeListToMarkdown(root.childNodes).replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeUrl(url: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("data:")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export const BlogMarkdownEditor = React.forwardRef<
  BlogMarkdownEditorRef,
  {
    value: string;
    onChange: (value: string) => void;
    onInsertImage?: () => void;
    placeholder?: string;
    className?: string;
    minHeight?: string;
    /** Deprecated: the editor is always visual now. Kept for API compatibility. */
    showPreview?: boolean;
  }
>(function BlogMarkdownEditor(
  {
    value,
    onChange,
    onInsertImage,
    placeholder = PLACEHOLDER,
    className,
    minHeight = "min-h-[420px]",
  },
  ref
) {
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const lastSyncedMarkdownRef = React.useRef<string>("");
  const [html, setHtml] = React.useState(() => markdownToEditorHtml(value || ""));

  React.useEffect(() => {
    if (value === lastSyncedMarkdownRef.current) return;
    lastSyncedMarkdownRef.current = value || "";
    setHtml(markdownToEditorHtml(value || ""));
  }, [value]);

  const syncFromDom = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = editorHtmlToMarkdown(editor);
    lastSyncedMarkdownRef.current = next;
    onChange(next);
  }, [onChange]);

  const focusEditor = React.useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const runCommand = React.useCallback(
    (command: string, commandValue?: string) => {
      focusEditor();
      document.execCommand(command, false, commandValue);
      syncFromDom();
    },
    [focusEditor, syncFromDom]
  );

  const insertHtmlAtCursor = React.useCallback(
    (snippet: string) => {
      focusEditor();
      document.execCommand("insertHTML", false, snippet);
      syncFromDom();
    },
    [focusEditor, syncFromDom]
  );

  const insertAtCursor = React.useCallback(
    (snippet: string) => {
      insertHtmlAtCursor(markdownToEditorHtml(snippet));
    },
    [insertHtmlAtCursor]
  );

  React.useImperativeHandle(
    ref,
    () => ({
      insertAtCursor,
      focus: focusEditor,
    }),
    [focusEditor, insertAtCursor]
  );

  const toolbar: ToolbarAction[] = React.useMemo(
    () => [
      {
        icon: Bold,
        label: "Жирный",
        run: () => runCommand("bold"),
      },
      {
        icon: Italic,
        label: "Курсив",
        run: () => runCommand("italic"),
      },
      {
        icon: Heading2,
        label: "Заголовок",
        run: () => runCommand("formatBlock", "h2"),
      },
      {
        icon: Heading3,
        label: "Подзаголовок",
        run: () => runCommand("formatBlock", "h3"),
      },
      {
        icon: List,
        label: "Список",
        run: () => runCommand("insertUnorderedList"),
      },
      {
        icon: Quote,
        label: "Цитата",
        run: () => runCommand("formatBlock", "blockquote"),
      },
      {
        icon: LinkIcon,
        label: "Ссылка",
        run: () => {
          const url = normalizeUrl(window.prompt("URL ссылки") || "");
          if (!url) return;
          const selection = window.getSelection()?.toString() || "";
          if (selection) runCommand("createLink", url);
          else insertHtmlAtCursor(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`);
        },
      },
      {
        icon: Code,
        label: "Код",
        run: () => runCommand("formatBlock", "pre"),
      },
      {
        icon: SquareCode,
        label: "Блок кода",
        run: () => insertHtmlAtCursor("<pre><code>Текст...</code></pre>"),
      },
      {
        icon: Minus,
        label: "Разделитель",
        run: () => insertHtmlAtCursor("<hr>"),
      },
      {
        icon: ImageIcon,
        label: "Вставить изображение по ссылке",
        run: () => {
          const src = window.prompt("URL изображения") || "";
          if (!src.trim()) return;
          insertHtmlAtCursor(`<img src="${escapeAttr(src.trim())}" alt="">`);
        },
      },
      ...(onInsertImage
        ? [
            {
              icon: Upload,
              label: "Загрузить обложку",
              run: onInsertImage,
            },
          ]
        : []),
    ],
    [insertHtmlAtCursor, onInsertImage, runCommand]
  );

  return (
    <div className={cn("w-full rounded-lg border border-border overflow-hidden", className)}>
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30">
        {toolbar.map(({ icon: Icon, label, run }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={run}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="relative bg-background">
        {!value.trim() ? (
          <div className="pointer-events-none absolute left-5 top-5 text-muted-foreground">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            minHeight,
            "w-full max-w-none overflow-auto p-5 outline-none",
            "prose prose-invert prose-lg",
            "focus-visible:ring-2 focus-visible:ring-ring/40",
            "[&_h1]:text-4xl [&_h1]:mb-8 [&_h1]:mt-12 [&_h1]:text-foreground",
            "[&_h2]:text-3xl [&_h2]:mt-12 [&_h2]:mb-6 [&_h2]:text-foreground",
            "[&_h3]:text-2xl [&_h3]:mt-8 [&_h3]:mb-4 [&_h3]:text-foreground",
            "[&_h4]:text-xl [&_h4]:mt-6 [&_h4]:mb-3 [&_h4]:text-foreground",
            "[&_p]:text-muted-foreground [&_p]:mb-4 [&_p]:leading-relaxed",
            "[&_a]:text-primary [&_a]:underline",
            "[&_code]:bg-secondary [&_code]:text-foreground [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm",
            "[&_pre]:bg-secondary [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-6",
            "[&_pre_code]:block [&_pre_code]:p-0 [&_pre_code]:bg-transparent",
            "[&_ul]:list-disc [&_ul]:list-inside [&_ul]:text-muted-foreground [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:ml-4",
            "[&_ol]:list-decimal [&_ol]:list-inside [&_ol]:text-muted-foreground [&_ol]:mb-4 [&_ol]:space-y-2 [&_ol]:ml-4",
            "[&_li]:text-muted-foreground",
            "[&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-6",
            "[&_hr]:border-border [&_hr]:my-8",
            "[&_strong]:text-foreground",
            "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:border [&_img]:border-border/50 [&_img]:my-6"
          )}
          dangerouslySetInnerHTML={{ __html: html }}
          onInput={syncFromDom}
          onBlur={syncFromDom}
          onPaste={() => {
            requestAnimationFrame(syncFromDom);
          }}
        />
      </div>
    </div>
  );
});
