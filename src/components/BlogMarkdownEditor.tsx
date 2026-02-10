"use client";

import * as React from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  Link as LinkIcon,
  Code,
  SquareCode,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./ui/resizable";
import { MarkdownContent } from "./MarkdownContent";
import { cn } from "./ui/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const PLACEHOLDER = `# Заголовок

Текст статьи...

---

**Теги**: тег1, тег2
**Дата публикации**: ...
`;

type ToolbarAction = {
  icon: LucideIcon;
  label: string;
  run: () => void;
};

export type BlogMarkdownEditorRef = {
  insertAtCursor: (text: string) => void;
  focus: () => void;
};

export const BlogMarkdownEditor = React.forwardRef<
  BlogMarkdownEditorRef,
  {
    value: string;
    onChange: (value: string) => void;
    onInsertImage?: () => void;
    placeholder?: string;
    className?: string;
    minHeight?: string;
    /** Показывать ли предпросмотр (split view). По умолчанию true */
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
    showPreview = true,
  },
  ref
) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const insertAtCursor = React.useCallback((snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start =
      typeof el.selectionStart === "number" ? el.selectionStart : 0;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const next =
      value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + snippet.length;
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  }, [value, onChange]);

  const wrapSelection = React.useCallback(
    (before: string, after: string, placeholderText: string) => {
      const el = textareaRef.current;
      if (!el) {
        insertAtCursor(`${before}${placeholderText}${after}`);
        return;
      }
      const start =
        typeof el.selectionStart === "number" ? el.selectionStart : 0;
      const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
      const selected = value.slice(start, end);
      const inner = selected || placeholderText;
      const snippet = `${before}${inner}${after}`;
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        try {
          el.focus();
          const innerStart = start + before.length;
          const innerEnd = innerStart + inner.length;
          el.setSelectionRange(innerStart, innerEnd);
        } catch {
          // ignore
        }
      });
    },
    [value, onChange, insertAtCursor]
  );

  const prefixLines = React.useCallback(
    (prefix: string) => {
      const el = textareaRef.current;
      if (!el) {
        insertAtCursor(`\n${prefix}`);
        return;
      }
      const start =
        typeof el.selectionStart === "number" ? el.selectionStart : 0;
      const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
      const selected = value.slice(start, end) || "Пункт";
      const lines = selected
        .split("\n")
        .map((l) => (l.trim() ? `${prefix}${l}` : l));
      const snippet = lines.join("\n");
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(start, start + snippet.length);
        } catch {
          // ignore
        }
      });
    },
    [value, onChange, insertAtCursor]
  );

  React.useImperativeHandle(ref, () => ({
    insertAtCursor,
    focus: () => textareaRef.current?.focus(),
  }), [insertAtCursor]);

  const toolbar: ToolbarAction[] = React.useMemo(
    () => [
      {
        icon: Bold,
        label: "Жирный",
        run: () => wrapSelection("**", "**", "текст"),
      },
      {
        icon: Italic,
        label: "Курсив",
        run: () => wrapSelection("*", "*", "текст"),
      },
      {
        icon: Heading1,
        label: "Заголовок 1",
        run: () => prefixLines("# "),
      },
      {
        icon: Heading2,
        label: "Заголовок 2",
        run: () => prefixLines("## "),
      },
      {
        icon: List,
        label: "Список",
        run: () => prefixLines("- "),
      },
      {
        icon: LinkIcon,
        label: "Ссылка",
        run: () =>
          wrapSelection("[", "](https://example.com)", "текст ссылки"),
      },
      {
        icon: Code,
        label: "Код",
        run: () => wrapSelection("`", "`", "код"),
      },
      {
        icon: SquareCode,
        label: "Блок кода",
        run: () => insertAtCursor("\n\n```text\nТекст...\n```\n"),
      },
      ...(onInsertImage
        ? [
            {
              icon: ImageIcon,
              label: "Вставить изображение",
              run: onInsertImage,
            },
          ]
        : []),
    ],
    [wrapSelection, prefixLines, insertAtCursor, onInsertImage]
  );

  const editorArea = (
    <div className={cn("flex flex-col h-full", minHeight)}>
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30 rounded-t-lg">
        {toolbar.map(({ icon: Icon, label, run }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={run}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "flex-1 w-full resize-none rounded-t-none rounded-b-lg border-t-0 font-mono text-sm leading-relaxed",
          showPreview ? "min-h-[280px]" : minHeight
        )}
        spellCheck={false}
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
      />
    </div>
  );

  if (!showPreview) {
    return <div className={cn("space-y-0", className)}>{editorArea}</div>;
  }

  return (
    <div className={cn("w-full", className)}>
      <ResizablePanelGroup
        direction="horizontal"
        className={cn(
          "rounded-lg border border-border overflow-hidden",
          minHeight
        )}
      >
        <ResizablePanel defaultSize={50} minSize={30} order={1}>
          <div className="h-full overflow-auto bg-background">
            {editorArea}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={25} order={2}>
          <div className="h-full overflow-auto bg-muted/20 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Предпросмотр
            </p>
            <MarkdownContent
              markdown={value || "*Введите текст для предпросмотра*"}
              proseClassName="max-w-none dark:prose-invert"
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
});
