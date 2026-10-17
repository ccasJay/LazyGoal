import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        table: ({ children }) => (
          <div className="markdown-table-scroll">
            <table>{children}</table>
          </div>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        img: ({ src, alt }) =>
          src ? (
            <a href={src} target="_blank" rel="noopener noreferrer">
              {alt || "Image"}
            </a>
          ) : (
            <span>{alt || "Image"}</span>
          ),
      }}
    >
      {content}
    </Markdown>
  );
}

