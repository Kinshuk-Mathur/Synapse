"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

const markdownPlugins = [remarkGfm];
const rehypePlugins = [[rehypeHighlight, { ignoreMissing: true }]];
const INVALID_PLACEHOLDER_MARKDOWN = `# Response Formatting Issue

This answer contained an internal placeholder, so SYNAPSE blocked it from display.

## Next Step

Use **Regenerate** to get the clean structured answer.`;

function isInvalidPlaceholderReply(value = "") {
  return /^(clean Markdown user-facing answer|code here)\.?$/i.test(String(value || "").trim());
}

function normalizeMarkdownSpacing(value = "") {
  const raw = String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .trim();

  if (!raw) return "";

  const parts = raw.split(/(```[\s\S]*?```)/g);

  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part.trim();

      return part
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/([^\n])(\s+#{1,3}\s+)/g, "$1\n\n$2")
        .replace(/([^\n])(\s+(?:[-*]\s+|\d+\.\s+))/g, "$1\n$2")
        .replace(/(^|\n)(#{1,3}\s+[^\n]+)\n(?!\n)/g, "$1$2\n\n")
        .replace(/(^|\n)([-*]\s+[^\n]+)\n(?![-*\s\d]|\n)/g, "$1$2\n\n")
        .replace(/(^|\n)(\d+\.\s+[^\n]+)\n(?!\d+\.|\n)/g, "$1$2\n\n")
        .trim();
    })
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FORMATTER_SECTIONS = {
  "📊": "snapshot",
  "🔥": "strengths", 
  "⚠️": "warning",
  "🎯": "action",
  "🚀": "growth"
};

function hasMarkdownStructure(value = "") {
  const text = String(value || "");

  return (
    /(^|\n)\s{0,3}#{1,4}\s+\S/m.test(text) ||
    /(^|\n)\s*(?:[-*+]\s+|\d+\.\s+)/m.test(text) ||
    /(^|\n)\s*>\s+\S/m.test(text) ||
    /(^|\n)\s*\|.+\|\s*$/m.test(text) ||
    /\*\*[^*\n]{2,80}\*\*/.test(text) ||
    /```[\s\S]*?```/.test(text)
  );
}

function splitSentences(value = "") {
  return (
    String(value || "")
      .match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || []
  );
}

function groupSentences(sentences = [], size = 2) {
  const groups = [];

  for (let index = 0; index < sentences.length; index += size) {
    groups.push(sentences.slice(index, index + size).join(" "));
  }

  return groups;
}

function upgradeRoadmapStructure(value = "") {
  const text = String(value || "");

  return text
    .replace(/^(Phase\s+\d+[:\s][^\n]+)/gm, "\n\n## $1\n")
    .replace(/^(\*\*[^*\n]{3,60}\*\*)$/gm, "\n\n### $1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function structurePlainAiReply(value = "") {
  const text = String(value || "").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const sentences = splitSentences(text);

  if (
    !text ||
    wordCount < 70 ||
    sentences.length < 4 ||
    hasMarkdownStructure(text) ||
    /^[\[{]/.test(text)
  ) {
    return text;
  }

  const hasSingleParagraph = !/\n{2,}/.test(text);
  const bodySentences = hasSingleParagraph && sentences.length > 4 ? sentences.slice(0, -1) : sentences;
  const body =
    hasSingleParagraph
      ? groupSentences(bodySentences, 2).join("\n\n")
      : text
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .join("\n\n");
  const keyTakeaway = hasSingleParagraph && sentences.length > 4 ? sentences.at(-1) : "";

  return [
    "# 🧠 SYNAPSE Answer",
    `## 📖 Core Explanation\n\n${body}`,
    keyTakeaway ? `## 📌 Key Takeaway\n\n- ${keyTakeaway}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

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
  const extractedMarkdown = extractAiReplyText(content);
  const normalizedMarkdown = isInvalidPlaceholderReply(extractedMarkdown)
    ? INVALID_PLACEHOLDER_MARKDOWN
    : normalizeMarkdownSpacing(extractedMarkdown);
  const upgraded = upgradeRoadmapStructure(normalizedMarkdown);
  const markdown = compact ? upgraded : structurePlainAiReply(upgraded);

  return (
    <ReactMarkdown
      className={`synapse-markdown ai-response-markdown ${compact ? "is-compact" : ""}`}
      remarkPlugins={markdownPlugins}
      rehypePlugins={rehypePlugins}
      skipHtml
      components={{
        h1: ({ children, node, ...props }) => (
          <h1 className="ai-md-heading ai-md-heading-main" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, node, ...props }) => {
          const text = String(children || "");
          const sectionType = Object.entries(FORMATTER_SECTIONS)
            .find(([emoji]) => text.startsWith(emoji))?.[1];
          const className = [
            "ai-md-heading",
            "ai-md-heading-section",
            sectionType ? `ai-section-${sectionType}` : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <h2 
              {...props}
              className={className}
              style={{ marginTop: "2rem", marginBottom: "0.5rem", ...props.style }}
            >
              {children}
            </h2>
          );
        },
        
        h3: ({ children, node, ...props }) => (
          <h3 
            className="ai-md-heading ai-md-heading-subsection"
            style={{ marginTop: "1.25rem", marginBottom: "0.35rem" }}
            {...props}
          >
            {children}
          </h3>
        ),
         
        p: ({ children, node, ...props }) => (
          <p 
            className="ai-md-paragraph" 
            style={{ marginBottom: "0.75rem", lineHeight: "1.7" }}
            {...props}
          >
            {children}
          </p>
        ),
        ul: ({ children, node, ...props }) => (
          <ul className="ai-md-list ai-md-list-unordered" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, node, ...props }) => (
          <ol className="ai-md-list ai-md-list-ordered" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, node, ...props }) => (
          <li className="ai-md-list-item" {...props}>
            {children}
          </li>
        ),
        blockquote: ({ children, node, ...props }) => (
          <blockquote className="ai-md-callout" {...props}>
            {children}
          </blockquote>
        ),
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
