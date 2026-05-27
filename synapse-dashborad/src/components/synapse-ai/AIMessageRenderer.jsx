"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

const markdownPlugins = [remarkGfm];
const rehypePlugins = [[rehypeHighlight, { ignoreMissing: true }]];

function parseJsonStringAt(value, startIndex) {
  if (value[startIndex] !== "\"") return "";

  let output = "";
  let escaping = false;

  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];

    if (escaping) {
      const escapeMap = {
        "\"": "\"",
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t"
      };

      output += escapeMap[char] ?? char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "\"") {
      return output.trim();
    }

    output += char;
  }

  return "";
}

function extractMalformedReply(value) {
  const raw = String(value || "");
  const replyKey = /["']reply["']\s*:/i.exec(raw);

  if (!replyKey) return "";

  const afterKey = raw.slice(replyKey.index + replyKey[0].length).trimStart();
  if (!afterKey.startsWith("\"")) return "";

  return parseJsonStringAt(afterKey, 0);
}

export function extractAiReplyText(content) {
  if (content && typeof content === "object") {
    const reply = content.reply || content.message || content.content;
    return typeof reply === "string" ? reply.trim() : "";
  }

  const raw = String(content || "").trim();
  if (!raw) return "";

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const objectLike =
    raw.startsWith("{") && raw.endsWith("}")
      ? raw
      : raw.includes("\"reply\"") && raw.includes("\"action\"")
        ? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)
        : "";
  const candidates = [fenced?.[1], objectLike, raw].filter(Boolean);

  for (const candidate of candidates) {
    let parsed = candidate.trim();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        break;
      }

      if (parsed && typeof parsed === "object") {
        const reply = parsed.reply || parsed.message || parsed.content;
        if (typeof reply === "string" && reply.trim()) return reply.trim();
        break;
      }

      if (typeof parsed !== "string") break;
    }
  }

  const malformedReply = extractMalformedReply(raw);
  return malformedReply || raw;
}

function getCodeLanguage(className = "") {
  const match = /language-([\w-]+)/.exec(className);
  return match?.[1] || "code";
}

function CodeBlock({ className = "", children, node, ...props }) {
  const [copied, setCopied] = useState(false);
  const value = String(children || "").replace(/\n$/, "");
  const isBlock = className.includes("language-") || value.includes("\n");
  const language = getCodeLanguage(className);

  if (!isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="ai-code-block">
      <div className="ai-code-toolbar">
        <span>{language}</span>
        <button type="button" onClick={copyCode} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export default function AIMessageRenderer({ content, compact = false }) {
  const markdown = extractAiReplyText(content);

  return (
    <ReactMarkdown
      className={`synapse-markdown ai-response-markdown ${compact ? "is-compact" : ""}`}
      remarkPlugins={markdownPlugins}
      rehypePlugins={rehypePlugins}
      skipHtml
      components={{
        pre: ({ children }) => <>{children}</>,
        code: CodeBlock,
        table: ({ children, node, ...props }) => (
          <div className="ai-table-scroll">
            <table {...props}>{children}</table>
          </div>
        )
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
