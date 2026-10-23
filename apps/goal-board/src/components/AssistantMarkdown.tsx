import { Table } from "./ui/table";
import React, { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 助手回复及显式 Think 输出的安全 Markdown 渲染边界。
 *
 * @remarks
 * 按内容字符串浅比较以跳过重复解析；只呈现 GFM Markdown，外链新窗口打开，
 * 图片降级为链接，不渲染原始 HTML。
 */
export const AssistantMarkdown = memo(function AssistantMarkdown({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        table: ({ children }) => (
          <div className="markdown-table-scroll">
            <Table>{children}</Table>
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
});
