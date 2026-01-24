import ReactMarkdown from "react-markdown";

import { cn } from "./ui/utils";

const DEFAULT_FALLBACK_IMAGE_SRC = "/opengraphlogo.jpeg";

const markdownComponents = {
  h1: ({ node, ...props }: any) => (
    <h1 className="text-4xl mb-8 mt-12 text-foreground" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <h2 className="text-3xl mt-12 mb-6 text-foreground" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-2xl mt-8 mb-4 text-foreground" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h4 className="text-xl mt-6 mb-3 text-foreground" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="text-muted-foreground mb-4 leading-relaxed" {...props} />
  ),
  a: ({ node, ...props }: any) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  code: ({ node, inline, ...props }: any) =>
    inline ? (
      <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-sm" {...props} />
    ) : (
      <code className="block bg-secondary text-foreground p-4 rounded-lg overflow-x-auto text-sm" {...props} />
    ),
  pre: ({ node, ...props }: any) => (
    <pre className="bg-secondary rounded-lg p-4 overflow-x-auto mb-6" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="list-disc list-inside text-muted-foreground mb-4 space-y-2 ml-4" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol className="list-decimal list-inside text-muted-foreground mb-4 space-y-2 ml-4" {...props} />
  ),
  li: ({ node, ...props }: any) => <li className="text-muted-foreground" {...props} />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground my-6" {...props} />
  ),
  hr: ({ node, ...props }: any) => <hr className="border-border my-8" {...props} />,
  strong: ({ node, ...props }: any) => <strong className="text-foreground" {...props} />,
  img: ({ node, ...props }: any) => {
    const rawSrc = typeof props.src === "string" ? props.src.trim() : "";
    const src = rawSrc || DEFAULT_FALLBACK_IMAGE_SRC;

    return (
      <img
        {...props}
        src={src}
        alt={typeof props.alt === "string" ? props.alt : ""}
        loading={props.loading ?? "lazy"}
        className={cn(
          "max-w-full h-auto rounded-xl border border-border/50 my-6",
          props.className
        )}
        onError={(e) => {
          // Avoid infinite loop if fallback also fails for some reason
          const target = e.currentTarget;
          if (target.getAttribute("data-fallback-applied") === "1") return;
          target.setAttribute("data-fallback-applied", "1");
          target.src = DEFAULT_FALLBACK_IMAGE_SRC;
        }}
      />
    );
  },
};

type MarkdownContentProps = {
  markdown: string;
  proseClassName?: string;
} & Omit<React.ComponentProps<"div">, "children">;

export function MarkdownContent({
  markdown,
  proseClassName,
  className,
  ...divProps
}: MarkdownContentProps) {
  return (
    <div
      className={cn("prose prose-invert prose-lg max-w-none", proseClassName, className)}
      {...divProps}
    >
      <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
    </div>
  );
}

