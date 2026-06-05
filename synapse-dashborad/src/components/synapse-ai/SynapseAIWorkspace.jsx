"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  FileCode2,
  FileQuestion,
  FileText,
  GraduationCap,
  Home,
  History,
  ImageIcon,
  Menu,
  MessageSquareText,
  Mic,
  NotebookPen,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sigma,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  X,
  Zap
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { recordMeaningfulAiUsage } from "../../services/analytics";
import { consumeSynapseUsage } from "../../services/usageLimits";
import { updateMomentumProgress } from "../../services/userStats";
import {
  formatPdfFileSize,
  isPdfFile,
  normalizePdfTitle,
  PDF_LIMITS
} from "../../utils/pdfParser";
import ProfileAvatarMenu from "../ProfileAvatarMenu";
import AIMessageRenderer, { extractAiReplyText } from "./AIMessageRenderer";

const STORAGE_KEY = "synapse-ai-conversations";
const UPLOADED_FILES_KEY = "synapse-ai-uploaded-files";
const SAVED_NOTES_KEY = "synapse-ai-saved-notes";
const TASK_DRAFTS_KEY = "synapse-ai-task-drafts";
const GOAL_DRAFTS_KEY = "synapse-ai-goal-drafts";
const DASHBOARD_HREF = "/";
const SUPPORTED_FILE_COPY = "PDF, JPG, PNG, HTML, text, Markdown, code, or JSON files";
const SAFE_AI_ERROR = "SYNAPSE AI is currently busy. Please try again shortly.";
const THINKING_STAGES = [
  "Analyzing your question...",
  "Building structured explanation...",
  "Planning best response..."
];
const VOICE_IDLE_STATUS = "Voice mode ready";
const VOICE_STATUS_COPY = {
  idle: VOICE_IDLE_STATUS,
  listening: "SYNAPSE is listening...",
  processing: "Analyzing your productivity...",
  speaking: "SYNAPSE responding..."
};
const VOICE_ERROR_COPY = {
  "not-allowed": "Microphone access required.",
  "service-not-allowed": "Microphone access required.",
  "audio-capture": "No microphone detected.",
  "no-speech": "Speech timeout. Try again.",
  network: "Voice recognition is having trouble.",
  aborted: "",
  empty: "I did not catch that. Try again.",
  unsupported: "Voice mode not supported in this browser."
};

const quickActions = [
  {
    label: "Ask PDF",
    icon: Search,
    prompt: "Ask a precise question about the active PDF:"
  },
  {
    label: "Solve Doubt",
    icon: Sparkles,
    prompt: "Solve this doubt step by step like a teacher:"
  },
  {
    label: "Study Plan",
    icon: GraduationCap,
    prompt: "Create a focused study plan for my next exam with daily tasks and revision blocks."
  },
  {
    label: "Explain Topic",
    icon: MessageSquareText,
    prompt: "Explain this topic simply, then give examples and common mistakes:"
  },
  {
    label: "Productivity Help",
    icon: Zap,
    prompt: "Analyze my current productivity status and give me a structured performance snapshot with strengths, areas needing attention, and my single highest-impact next step."
  }
];

const pdfQuickActions = [
  {
    key: "summarize",
    label: "Summarize",
    shortLabel: "Summary",
    icon: FileText,
    prompt: "Summarize this PDF into key points, formulas, definitions, and a revision checklist.",
    loading: "Summarizing PDF intelligence..."
  },
  {
    key: "notes",
    label: "Generate Notes",
    shortLabel: "Notes",
    icon: NotebookPen,
    prompt: "Generate premium revision notes from this PDF.",
    loading: "Generating revision notes..."
  },
  {
    key: "quiz",
    label: "Quiz Me",
    shortLabel: "Quiz",
    icon: FileQuestion,
    prompt: "Create a quiz from this PDF with answers and explanations.",
    loading: "Creating quiz questions..."
  },
  {
    key: "concepts",
    label: "Key Concepts",
    shortLabel: "Concepts",
    icon: Brain,
    prompt: "Extract the key concepts from this PDF and explain why they matter.",
    loading: "Extracting key concepts..."
  },
  {
    key: "formulas",
    label: "Formulas",
    shortLabel: "Formulas",
    icon: Sigma,
    prompt: "Extract important formulas, equations, and laws from this PDF.",
    loading: "Scanning formulas and equations..."
  },
  {
    key: "simple",
    label: "Explain Simply",
    shortLabel: "Simple",
    icon: Sparkles,
    prompt: "Explain the hardest ideas in this PDF in simple language.",
    loading: "Simplifying difficult topics..."
  },
  {
    key: "flashcards",
    label: "Flashcards",
    shortLabel: "Cards",
    icon: ClipboardList,
    prompt: "Create active-recall flashcards from this PDF.",
    loading: "Creating flashcards..."
  }
];

function createWelcomeMessage(studentName = "Student") {
  return {
    id: "welcome",
    role: "assistant",
    content: getWelcomeMessageContent(studentName),
    createdAt: new Date().toISOString(),
    synthetic: true
  };
}

function getWelcomeMessageContent(studentName = "Student") {
  const name = String(studentName || "Student").trim() || "Student";
  return `Hi ${name}, I am SYNAPSE AI. Ask a study doubt, plan your week, or upload a PDF and I will help you turn it into clear next steps.`;
}

function createConversation(studentName = "Student") {
  const now = new Date().toISOString();

  return {
    id: `chat-${Date.now()}`,
    title: "New Chat",
    updatedAt: now,
    messages: [createWelcomeMessage(studentName)]
  };
}

function limitStoredConversation(conversation) {
  return {
    ...conversation,
    messages: (conversation.messages || []).slice(-34).map((message) => ({
      ...message,
      content:
        typeof message.content === "string" && message.content.length > 10_000
          ? `${message.content.slice(0, 10_000)}\n\n[Trimmed locally for faster SYNAPSE navigation.]`
          : message.content
    }))
  };
}

function limitStoredConversations(conversations = []) {
  return conversations.slice(0, 14).map(limitStoredConversation);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function fileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function serializePdfDocument(documentData) {
  if (!documentData) return null;

  return {
    id: documentData.id,
    title: documentData.title || normalizePdfTitle(documentData.fileName),
    fileName: documentData.fileName || documentData.title || "Study PDF",
    fileUrl: documentData.fileUrl || "",
    extractedText: documentData.extractedText || "",
    pageCount: documentData.pageCount || 0,
    fileSize: documentData.fileSize || 0,
    fileSizeLabel: documentData.fileSizeLabel || formatPdfFileSize(documentData.fileSize || 0),
    chunkCount: documentData.chunkCount || 0,
    textTruncated: Boolean(documentData.textTruncated)
  };
}

async function safelyReadChatJson(response) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return {
      message: SAFE_AI_ERROR
    };
  }
}

async function readSynapseAiStream(response, handlers = {}) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error(SAFE_AI_ERROR);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (line) => {
    const trimmed = line.trim();

    if (!trimmed) return;

    let payload = null;

    try {
      payload = JSON.parse(trimmed);
    } catch {
      throw new Error(SAFE_AI_ERROR);
    }

    if (payload.type === "token") {
      handlers.onToken?.(String(payload.content || ""));
      return;
    }

    if (payload.type === "meta") {
      handlers.onMeta?.(payload);
      return;
    }

    if (payload.type === "done") {
      handlers.onDone?.(payload);
      return;
    }

    if (payload.type === "error") {
      throw new Error(payload.message || SAFE_AI_ERROR);
    }
  };

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buffer.trim()) {
    handleLine(buffer);
  }
}

function makeTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
}

const SUPERSCRIPT_MAP = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ"
};

const SUBSCRIPT_MAP = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ"
};

function toMappedNumber(value, map) {
  return String(value)
    .split("")
    .map((char) => map[char] || map[char.toLowerCase()] || char)
    .join("");
}

function convertLatexExpression(value) {
  let text = String(value || "");

  text = text
    .replace(/\\left|\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\pi/g, "π")
    .replace(/\\epsilon/g, "ε")
    .replace(/\\theta/g, "θ")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]*)\}/g, "$1")
    .replace(/\\mathbf\{([^{}]*)\}/g, "$1")
    .replace(/\\hat\{([^{}]+)\}/g, "$1̂")
    .replace(/\\vec\{([^{}]+)\}/g, "$1⃗")
    .replace(/\\overrightarrow\{([^{}]+)\}/g, "$1⃗");

  text = text
    .replace(/\^\{([^{}]+)\}/g, (_, power) => toMappedNumber(power, SUPERSCRIPT_MAP))
    .replace(/\^([A-Za-z0-9+\-=()]+)/g, (_, power) => toMappedNumber(power, SUPERSCRIPT_MAP))
    .replace(/_\{([^{}]+)\}/g, (_, subscript) => toMappedNumber(subscript, SUBSCRIPT_MAP))
    .replace(/_([A-Za-z0-9+\-=()]+)/g, (_, subscript) => toMappedNumber(subscript, SUBSCRIPT_MAP));

  for (let index = 0; index < 4; index += 1) {
    text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)");
  }

  return text
    .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeMathContent(content) {
  return String(content)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expression) => `\n${convertLatexExpression(expression)}\n`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression) => `\n${convertLatexExpression(expression)}\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression) => convertLatexExpression(expression))
    .replace(/(^|\n)(.*\\(?:frac|vec|hat|times|text|epsilon|pi|cdot|left|right).*)/g, (_, prefix, expression) => {
      return `${prefix}${convertLatexExpression(expression)}`;
    });
}

function formatDenseAiContent(content) {
  const text = extractAiReplyText(content);
  const lineCount = text.split("\n").filter((line) => line.trim()).length;

  if (text.length < 220 || lineCount > 3) return text;

  return text
    .replace(/\s+(\*\*Phase\s+\d+:[^*]+\*\*)/g, "\n\n### $1")
    .replace(/\s+(\*\*(?:Additional Tips|Your Next Step|Key Takeaway|Example|Solution|Formula|Steps?)[^*]*\*\*)/g, "\n\n### $1")
    .replace(/\s+(\d+\.\s+\*\*[^*]+:\*\*)/g, "\n$1")
    .replace(/\s+(\d+\.\s+[A-Z][^:.]{2,64}:)/g, "\n$1")
    .replace(/\s+\*\s+/g, "\n- ")
    .trim();
}

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="SYNAPSE AI is typing">
      {[0, 1, 2].map((item) => (
        <motion.i
          key={item}
          animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: item * 0.14 }}
        />
      ))}
    </span>
  );
}

function ThinkingIndicator({ label = "" }) {
  const [stageIndex, setStageIndex] = useState(0);
  const stages = useMemo(
    () =>
      label
        ? [label, "Searching document context...", "Composing mentor answer..."]
        : THINKING_STAGES,
    [label]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % stages.length);
    }, 1250);

    return () => window.clearInterval(interval);
  }, [stages.length]);

  return (
    <div className="synapse-thinking">
      <div className="synapse-thinking-copy">
        <span>{stages[stageIndex] || stages[0]}</span>
        <TypingDots />
      </div>
      <div className="synapse-thinking-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function cleanTextForSpeech(content) {
  return extractAiReplyText(content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#|]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function selectBestVoice(voices = []) {
  const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang || ""));
  const maleVoiceMatchers = [
    /google.*(english).*male/i,
    /microsoft.*(guy|david|mark|ryan|george|christopher|eric|brian|roger)/i,
    /\b(alex|daniel|oliver|arthur|fred|tom|thomas|gordon|aaron|matthew|ryan|david|george|guy)\b/i,
    /\bmale\b/i
  ];
  const femaleVoiceMatcher =
    /\b(samantha|victoria|karen|moira|tessa|fiona|veena|zira|aria|jenny|susan|hazel|helen|sara|eva|joanna|kendra|kimberly|salli|ivy)\b/i;
  const preferredMatchers = [
    ...maleVoiceMatchers,
    /natural/i,
    /english/i
  ];

  for (const matcher of preferredMatchers) {
    const match = englishVoices.find((voice) => matcher.test(voice.name || ""));
    if (match) return match;
  }

  return englishVoices.find((voice) => !femaleVoiceMatcher.test(voice.name || "")) || englishVoices[0] || voices[0] || null;
}

function VoiceModeOrb({
  status,
  transcript,
  interimTranscript,
  error,
  noticeDismissed,
  onToggle,
  onStop
}) {
  const active = status !== "idle";
  const visibleTranscript = transcript || interimTranscript;
  const statusText = error || VOICE_STATUS_COPY[status] || VOICE_IDLE_STATUS;
  const helperText = error
    ? "Click the mic to try again."
    : visibleTranscript
      ? visibleTranscript
      : active
        ? "Press Esc to stop."
        : "Click to speak.";

  return (
    <motion.div
      className={`voice-mode-orb is-${status} ${active ? "is-active" : ""} ${error ? "has-error" : ""} ${
        noticeDismissed ? "is-notice-dismissed" : ""
      }`}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.button
        className="voice-orb-button"
        type="button"
        onClick={onToggle}
        onDoubleClick={onStop}
        aria-label={active ? "Stop voice mode" : "Start voice mode"}
        aria-pressed={active}
        title={active ? "Stop voice mode" : "Start voice mode"}
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="voice-orb-ring" aria-hidden="true" />
        <span className="voice-orb-core" aria-hidden="true">
          <Mic size={24} />
        </span>
        <span className="voice-waveform" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
            <i key={bar} style={{ animationDelay: `${bar * -120}ms` }} />
          ))}
        </span>
      </motion.button>

      <div className="voice-orb-status" role="status" aria-live="polite">
        <strong>{statusText}</strong>
        <span>{helperText}</span>
      </div>
    </motion.div>
  );
}

function getAttachmentIcon(attachment) {
  if (attachment?.type?.startsWith("image/")) return ImageIcon;
  if (attachment?.name?.match(/\.(html?|css|js|jsx|json|md|txt)$/i)) return FileCode2;
  return FileText;
}

function MessageBubble({ message, studentName, onCopy, onMessageAction }) {
  const fromUser = message.role === "user";
  const AttachmentIcon = getAttachmentIcon(message.attachment);
  const rawContent = !fromUser && message.synthetic && message.id === "welcome"
    ? getWelcomeMessageContent(studentName)
    : message.content;
  const displayContent = fromUser ? rawContent : formatDenseAiContent(rawContent);
  const aiActions = [
    {
      key: "copy",
      label: "Copy response",
      icon: Copy,
      onClick: () => onCopy(displayContent)
    },
    {
      key: "like",
      label: "Like response",
      icon: ThumbsUp,
      onClick: () => {}
    },
    {
      key: "dislike",
      label: "Dislike response",
      icon: ThumbsDown,
      onClick: () => {}
    },
    {
      key: "regenerate",
      label: "Reanswer",
      icon: RefreshCw,
      onClick: () => onMessageAction("regenerate", message)
    }
  ];

  return (
    <motion.article
      className={`synapse-message ${fromUser ? "from-user" : "from-ai"}`}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.24 }}
    >
      {!fromUser ? (
        <span className="message-avatar" aria-hidden="true">
          <Image
            src="/assets/synapse-icon-cropped.png"
            alt=""
            width={28}
            height={28}
          />
        </span>
      ) : null}

      <div className="message-shell">
        {message.attachment ? (
          <div className="message-attachment">
            <AttachmentIcon size={15} />
            <span>{message.attachment.name}</span>
          </div>
        ) : null}

        <AIMessageRenderer content={normalizeMathContent(displayContent)} compact={fromUser} />

        <footer>
          <time>{formatTime(message.createdAt)}</time>
          {!fromUser ? (
            <span className="message-actions">
              {aiActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.key} type="button" onClick={action.onClick} aria-label={action.label} title={action.label}>
                    <Icon size={15} />
                  </button>
                );
              })}
            </span>
          ) : (
            <Check size={14} />
          )}
        </footer>
      </div>
    </motion.article>
  );
}

function ChatSidebar({
  conversations,
  activeId,
  onNewChat,
  onOpenChat,
  onDeleteChat,
  open,
  onClose
}) {
  const sorted = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [conversations]
  );

  return (
    <motion.aside
      className={`synapse-ai-sidebar ${open ? "is-open" : "is-collapsed"}`}
      initial={false}
      animate={{ width: open ? 280 : 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="synapse-ai-brand">
        <Link href={DASHBOARD_HREF} aria-label="Go to SYNAPSE dashboard">
          <Image src="/assets/main-logo.jpeg" alt="SYNAPSE" width={138} height={52} priority />
        </Link>
        <button type="button" aria-label={open ? "Collapse sidebar" : "Expand sidebar"} onClick={onClose}>
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <motion.button
        className="new-ai-chat-button"
        type="button"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={onNewChat}
      >
        <i className="new-chat-icon" aria-hidden="true">
          <Plus size={17} />
        </i>
        <span>New Chat</span>
      </motion.button>

      <div className="chat-history-label">
        <History size={15} />
        <span>Recent Chats</span>
        <b>{sorted.length}</b>
      </div>

      <div className="synapse-history-list">
        {sorted.length ? (
          sorted.map((conversation) => (
            <motion.div
              key={conversation.id}
              className={`history-row ${conversation.id === activeId ? "is-active" : ""}`}
              whileHover={{ x: open ? 3 : 0 }}
            >
              <button type="button" onClick={() => onOpenChat(conversation.id)} title={conversation.title}>
                <MessageSquareText size={16} />
                <span>{conversation.title}</span>
              </button>
              <button
                className="delete-history-button"
                type="button"
                aria-label={`Delete ${conversation.title}`}
                onClick={() => onDeleteChat(conversation.id)}
              >
                <Trash2 size={15} />
              </button>
            </motion.div>
          ))
        ) : (
          <div className="synapse-history-empty">
            <MessageSquareText size={18} />
            <span>No chats yet</span>
          </div>
        )}
      </div>

      <div className="synapse-sidebar-footer-brand">
        <Image src="/assets/synapse-icon-cropped.png" alt="" width={42} height={42} />
        <div>
          <strong>SYNAPSE AI</strong>
          <span>Online study companion</span>
          <Link href={DASHBOARD_HREF}>
            <Home size={14} />
            Main dashboard
          </Link>
        </div>
      </div>
    </motion.aside>
  );
}

function getFileMeta(file) {
  return {
    id: `${file.name}-${file.size}-${file.lastModified || Date.now()}`,
    name: file.name,
    size: file.size,
    type: file.type,
    addedAt: new Date().toISOString()
  };
}

function ActivePdfStrip({ documentData, onClear, onAction }) {
  if (!documentData?.title) return null;

  return (
    <div className="active-pdf-strip">
      <span className="active-pdf-icon" aria-hidden="true">
        <FileText size={17} />
      </span>
      <div className="active-pdf-copy">
        <strong>{documentData.title}</strong>
        <small>
          {documentData.pageCount || "?"} pages • {documentData.chunkCount || 0} context chunks ready
        </small>
      </div>
      <div className="active-pdf-actions">
        {pdfQuickActions.slice(0, 4).map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.key}
              type="button"
              onClick={() => onAction(documentData, action)}
              aria-label={action.label}
              title={action.label}
            >
              <Icon size={14} />
              <span>{action.shortLabel}</span>
            </button>
          );
        })}
      </div>
      <button className="active-pdf-clear" type="button" onClick={onClear} aria-label="Clear active PDF">
        <X size={15} />
      </button>
    </div>
  );
}

function saveLocalArtifact(key, artifact) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
    const next = Array.isArray(saved) ? saved : [];
    window.localStorage.setItem(key, JSON.stringify([artifact, ...next].slice(0, 40)));
  } catch {
    window.localStorage.setItem(key, JSON.stringify([artifact]));
  }
}

export default function SynapseAIWorkspace() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [pdfUploadState, setPdfUploadState] = useState({
    stage: "idle",
    progress: 0,
    message: ""
  });
  const [aiStatusText, setAiStatusText] = useState("");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceNoticeDismissed, setVoiceNoticeDismissed] = useState(false);
  const streamRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceTimeoutRef = useRef(null);
  const voiceFinalTranscriptRef = useRef("");
  const voiceInterimTranscriptRef = useRef("");
  const voiceHadErrorRef = useRef(false);
  const voiceStatusRef = useRef("idle");
  const voiceRunIdRef = useRef(0);
  const speechVoicesRef = useRef([]);
  const { user, profile, setProfile } = useAuth();

  const studentName = profile?.name || user?.displayName?.split(" ")[0] || "Student";
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const SelectedFileIcon = getAttachmentIcon(
    selectedFile
      ? {
          name: selectedFile.name,
          type: selectedFile.type
        }
      : null
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      const valid = Array.isArray(saved) && saved.length > 0 ? limitStoredConversations(saved) : [createConversation(studentName)];

      setConversations(valid);
      setActiveId(valid[0].id);
    } catch {
      const firstConversation = createConversation(studentName);
      setConversations([firstConversation]);
      setActiveId(firstConversation.id);
    } finally {
      setHydrated(true);
    }
  }, [studentName]);

  useEffect(() => {
    try {
      const savedFiles = JSON.parse(window.localStorage.getItem(UPLOADED_FILES_KEY) || "[]");
      setUploadedFiles(Array.isArray(savedFiles) ? savedFiles : []);
    } catch {
      setUploadedFiles([]);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const persist = () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limitStoredConversations(conversations)));
    };
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(persist, { timeout: 900 })
      : window.setTimeout(persist, 0);

    return () => {
      if (window.cancelIdleCallback && typeof idleId === "number") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(uploadedFiles));
  }, [uploadedFiles, hydrated]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = Math.min(220, Math.max(132, window.innerHeight * 0.28));

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input, selectedFile, uploadError]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [activeConversation?.messages.length, loading]);

  useEffect(() => {
    if (!attachmentMenuOpen) return undefined;

    const closeAttachmentMenu = (event) => {
      if (attachmentMenuRef.current?.contains(event.target)) return;
      setAttachmentMenuOpen(false);
    };

    window.addEventListener("pointerdown", closeAttachmentMenu);
    return () => window.removeEventListener("pointerdown", closeAttachmentMenu);
  }, [attachmentMenuOpen]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    voiceStatusRef.current = voiceStatus;
  }, [voiceStatus]);

  useEffect(() => {
    if (voiceStatus !== "idle" || voiceError) {
      setVoiceNoticeDismissed(false);
    }
  }, [voiceStatus, voiceError]);

  useEffect(() => {
    if (voiceStatus === "idle" && !voiceError) return undefined;

    const dismissVoiceNotice = (event) => {
      if (event.target?.closest?.(".voice-mode-orb")) return;
      setVoiceNoticeDismissed(true);
    };

    window.addEventListener("pointerdown", dismissVoiceNotice);
    return () => window.removeEventListener("pointerdown", dismissVoiceNotice);
  }, [voiceStatus, voiceError]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;

    const loadVoices = () => {
      speechVoicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const updateConversation = (conversationId, updater) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation
      )
    );
  };

  const handleNewChat = () => {
    const nextConversation = createConversation(studentName);
    setConversations((current) => [nextConversation, ...current]);
    setActiveId(nextConversation.id);
    setInput("");
    setSelectedFile(null);
    setActiveDocument(null);
    setUploadError("");
    setSidebarOpen(false);
  };

  const handleDeleteChat = (conversationId) => {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== conversationId);

      if (!next.length) {
        const fresh = createConversation(studentName);
        setActiveId(fresh.id);
        return [fresh];
      }

      if (conversationId === activeId) {
        setActiveId(next[0].id);
      }

      return next;
    });
  };

  const handlePrompt = (prompt) => {
    setInput(prompt);
  };

  const handleFile = (file) => {
    if (!file) return;

    if (isPdfFile(file)) {
      if (file.size > PDF_LIMITS.maxFileSizeBytes) {
        setUploadError(`PDF limit is ${formatPdfFileSize(PDF_LIMITS.maxFileSizeBytes)}.`);
        return;
      }

      setUploadError("");
      setSelectedFile(file);
      setAttachmentMenuOpen(false);
      showToast("PDF attached");
      return;
    }

    const allowedExtensions = /\.(pdf|jpe?g|png|html?|txt|md|js|jsx|css|json)$/i;
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "text/html",
      "text/plain",
      "text/markdown",
      "text/css",
      "application/json",
      "application/javascript",
      "text/javascript"
    ];
    const supported = allowedTypes.includes(file.type) || allowedExtensions.test(file.name);

    if (!supported) {
      setUploadError(`Upload ${SUPPORTED_FILE_COPY}.`);
      return;
    }

    setUploadError("");
    setSelectedFile(file);
    setUploadedFiles((current) => {
      const nextFile = getFileMeta(file);
      const withoutDuplicate = current.filter((item) => item.id !== nextFile.id);
      return [nextFile, ...withoutDuplicate].slice(0, 12);
    });
    setAttachmentMenuOpen(false);
  };

  const openFilePicker = (accept) => {
    if (!fileRef.current) return;
    fileRef.current.accept = accept;
    fileRef.current.click();
    setAttachmentMenuOpen(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const showToast = (message) => {
    setToastMessage(message);

    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(""), 1600);
  };

  const clearVoiceTimeout = () => {
    if (voiceTimeoutRef.current) {
      window.clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
  };

  const updateVoiceStatus = (status) => {
    voiceStatusRef.current = status;
    setVoiceStatus(status);
  };

  const setVoiceFailure = (message) => {
    if (!message) return;
    setVoiceError(message);
    setVoiceNoticeDismissed(false);
    updateVoiceStatus("idle");
    showToast(message);
  };

  const stopVoiceMode = () => {
    voiceRunIdRef.current += 1;
    clearVoiceTimeout();
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    voiceFinalTranscriptRef.current = "";
    voiceInterimTranscriptRef.current = "";
    voiceHadErrorRef.current = false;
    setVoiceTranscript("");
    setVoiceInterimTranscript("");
    updateVoiceStatus("idle");

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speakAiResponse = (content) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      updateVoiceStatus("idle");
      return;
    }

    const speechText = cleanTextForSpeech(content);

    if (!speechText) {
      updateVoiceStatus("idle");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(speechText);
    const voices = speechVoicesRef.current.length
      ? speechVoicesRef.current
      : window.speechSynthesis.getVoices();
    const selectedVoice = selectBestVoice(voices);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => {
      setVoiceError("");
      updateVoiceStatus("speaking");
    };
    utterance.onend = () => {
      if (voiceStatusRef.current === "speaking") {
        updateVoiceStatus("idle");
      }
    };
    utterance.onerror = () => {
      if (voiceStatusRef.current === "speaking") {
        updateVoiceStatus("idle");
      }
    };

    updateVoiceStatus("speaking");
    window.speechSynthesis.speak(utterance);
  };

  const startVoiceRecognition = () => {
    if (typeof window === "undefined") return;

    window.speechSynthesis?.cancel?.();

    if (loading) {
      setVoiceFailure("SYNAPSE is already analyzing.");
      return;
    }

    const Recognition = window.webkitSpeechRecognition || window.SpeechRecognition;

    if (!Recognition) {
      setVoiceFailure(VOICE_ERROR_COPY.unsupported);
      return;
    }

    recognitionRef.current?.abort?.();
    clearVoiceTimeout();
    voiceFinalTranscriptRef.current = "";
    voiceInterimTranscriptRef.current = "";
    voiceHadErrorRef.current = false;
    voiceRunIdRef.current += 1;
    setVoiceTranscript("");
    setVoiceInterimTranscript("");
    setVoiceError("");
    setVoiceNoticeDismissed(false);
    const voiceRunId = voiceRunIdRef.current;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      updateVoiceStatus("listening");
      voiceTimeoutRef.current = window.setTimeout(() => {
        if (voiceStatusRef.current !== "listening") return;
        voiceHadErrorRef.current = true;
        recognition.stop();
        setVoiceFailure(VOICE_ERROR_COPY["no-speech"]);
      }, 12000);
    };

    recognition.onresult = (event) => {
      clearVoiceTimeout();

      let interim = "";
      let finalText = voiceFinalTranscriptRef.current;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcriptPart = event.results[index][0]?.transcript || "";

        if (event.results[index].isFinal) {
          finalText = `${finalText} ${transcriptPart}`.trim();
        } else {
          interim = `${interim} ${transcriptPart}`.trim();
        }
      }

      voiceFinalTranscriptRef.current = finalText;
      voiceInterimTranscriptRef.current = interim;
      setVoiceTranscript(finalText);
      setVoiceInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      const message = VOICE_ERROR_COPY[event.error] || "Voice recognition stopped.";

      if (event.error !== "aborted") {
        voiceHadErrorRef.current = true;
        clearVoiceTimeout();
        setVoiceFailure(message);
      }
    };

    recognition.onend = () => {
      clearVoiceTimeout();
      recognitionRef.current = null;

      if (voiceHadErrorRef.current) return;

      const transcript = (voiceFinalTranscriptRef.current || voiceInterimTranscriptRef.current || "").trim();

      if (!transcript) {
        setVoiceFailure(VOICE_ERROR_COPY.empty);
        return;
      }

      updateVoiceStatus("processing");
      setVoiceInterimTranscript("");
      handleSend({
        prompt: transcript,
        speakResponse: true,
        source: "voice",
        voiceRunId
      });
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setVoiceFailure("Voice recognition could not start.");
    }
  };

  const handleVoiceToggle = () => {
    if (voiceStatus === "listening") {
      stopVoiceMode();
      return;
    }

    if (voiceStatus === "processing") {
      showToast("SYNAPSE is already analyzing.");
      return;
    }

    startVoiceRecognition();
  };

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape" || voiceStatusRef.current === "idle") return;
      event.preventDefault();
      stopVoiceMode();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    return () => {
      if (voiceTimeoutRef.current) {
        window.clearTimeout(voiceTimeoutRef.current);
      }

      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  const copyMessage = async (content) => {
    await navigator.clipboard.writeText(extractAiReplyText(content));
    showToast("Copied response");
  };

  const handleMessageAction = (action, message) => {
    const content = extractAiReplyText(formatDenseAiContent(message.content));
    const artifact = {
      id: `${action}-${Date.now()}`,
      source: "synapse-ai",
      conversationId: activeId,
      messageId: message.id,
      content,
      createdAt: new Date().toISOString()
    };

    if (action === "regenerate") {
      const messages = activeConversation?.messages || [];
      const messageIndex = messages.findIndex((item) => item.id === message.id);
      const previousUser = messages
        .slice(0, messageIndex >= 0 ? messageIndex : messages.length)
        .reverse()
        .find((item) => item.role === "user");

      if (!previousUser) {
        showToast("No prompt found to regenerate");
        return;
      }

      setInput(String(previousUser.content || "").replace(/\n\nAttached file:[\s\S]*$/i, "").trim());
      textareaRef.current?.focus();
      showToast("Prompt loaded for regeneration");
      return;
    }

    if (action === "save-note") {
      saveLocalArtifact(SAVED_NOTES_KEY, {
        ...artifact,
        title: makeTitle(content)
      });
      showToast("Saved as note");
      return;
    }

    if (action === "add-tasks") {
      saveLocalArtifact(TASK_DRAFTS_KEY, {
        ...artifact,
        status: "draft"
      });
      showToast("Task draft saved");
      return;
    }

    if (action === "add-goals") {
      saveLocalArtifact(GOAL_DRAFTS_KEY, {
        ...artifact,
        status: "draft"
      });
      showToast("Goal draft saved");
    }
  };

  const handlePdfAction = (documentData, action) => {
    if (!documentData?.id) {
      showToast("Upload or select a PDF first");
      return;
    }

    setActiveDocument(documentData);
    handleSend({
      prompt: action.prompt,
      pdfAction: action.key,
      document: documentData,
      loadingLabel: action.loading,
      titleHint: `${action.shortLabel} • ${documentData.title || normalizePdfTitle(documentData.fileName)}`
    });
  };

  const handleSend = async (options = {}) => {
    const promptOverride = typeof options.prompt === "string" ? options.prompt : "";
    const trimmed = (promptOverride || input).trim();
    const attachedFile = selectedFile;
    const attachedPdfFile = attachedFile && isPdfFile(attachedFile) ? attachedFile : null;
    const documentForRequest = options.document || (!attachedPdfFile ? activeDocument : null);
    const initialPdfDocumentPayload = documentForRequest ? serializePdfDocument(documentForRequest) : null;
    const hasPdfContext = Boolean(initialPdfDocumentPayload?.extractedText || attachedPdfFile);
    const isVoiceRequest = options.source === "voice";
    const shouldSpeakResponse = Boolean(options.speakResponse);
    const voiceRunId = Number(options.voiceRunId || 0);
    const voiceRunIsCurrent = () => !shouldSpeakResponse || !voiceRunId || voiceRunId === voiceRunIdRef.current;
    const conversation = conversations.find((item) => item.id === activeId);
    const targetId = activeId;

    if (!conversation || loading || (!trimmed && !attachedFile && !hasPdfContext)) {
      if (shouldSpeakResponse && voiceRunIsCurrent()) {
        updateVoiceStatus("idle");
      }
      return;
    }

    try {
      await consumeSynapseUsage(user?.uid, {
        aiInteractions: 1,
        pdfUploads: attachedPdfFile ? 1 : 0
      });
      setUploadError("");
    } catch (usageLimitError) {
      const limitMessage = usageLimitError.message || "Today's SYNAPSE usage limit has been reached.";
      setUploadError(limitMessage);
      showToast(limitMessage);

      if (shouldSpeakResponse && voiceRunIsCurrent()) {
        setVoiceFailure(limitMessage);
      }

      return;
    }

    const now = new Date().toISOString();
    const interactionStartedAt = performance.now();
    const hadAttachment = Boolean(attachedFile || hasPdfContext);
    const attachmentText = attachedFile
      ? `\n\nAttached file: ${attachedFile.name} (${attachedFile.type || "unknown type"}, ${fileSize(attachedFile.size)}).`
      : "";
    const pdfContextText = initialPdfDocumentPayload
      ? `\n\nActive PDF: ${initialPdfDocumentPayload.title} (${initialPdfDocumentPayload.pageCount || "?"} pages, ${initialPdfDocumentPayload.fileSizeLabel}).`
      : "";
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: `${trimmed || (hasPdfContext ? "Please summarize this PDF." : "Please help with this file.")}${attachmentText}${pdfContextText}`,
      createdAt: now,
      attachment: initialPdfDocumentPayload && !attachedFile
        ? {
            name: initialPdfDocumentPayload.title,
            size: initialPdfDocumentPayload.fileSize,
            type: "application/pdf"
          }
        : attachedFile
        ? {
            name: attachedFile.name,
            size: attachedFile.size,
            type: attachedFile.type
          }
        : null
    };
    const baseMessages = conversation.messages.filter((message) => !message.synthetic);
    const nextMessages = [...baseMessages, userMessage]
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-6)  // ← reduce from 10 to 6 to protect context space for system prompt
      .map((message) => ({
        role: message.role,
        // Trim long AI responses in history — keeps structure instructions effective
        content: message.role === "assistant"
          ? String(message.content || "").slice(0, 1800)
          : String(message.content || "").slice(0, 600)
      }));

    updateConversation(targetId, (current) => ({
      ...current,
      title:
        current.title === "New Chat"
          ? makeTitle(options.titleHint || trimmed || attachedFile?.name || initialPdfDocumentPayload?.title || "PDF Summary")
          : current.title,
      updatedAt: now,
      messages: [...current.messages, userMessage]
    }));

    if (!promptOverride) {
      setInput("");
    }
    setSelectedFile(null);
    setLoading(true);
    setAiStatusText(
      options.loadingLabel ||
        (attachedPdfFile ? "Uploading and reading PDF..." : initialPdfDocumentPayload ? "Analyzing PDF context..." : "")
    );

    let assistantMessageId = "";
    let hasAssistantMessage = false;
    let streamedContent = "";

    const recordAiMomentum = async () => {
      try {
        await updateMomentumProgress(user?.uid, {
          pillar: "ai",
          prompt: trimmed,
          hasAttachment: hadAttachment,
          interactionDurationMs: performance.now() - interactionStartedAt
        });
        await recordMeaningfulAiUsage(user?.uid, {
          prompt: trimmed,
          hasAttachment: hadAttachment,
          interactionDurationMs: performance.now() - interactionStartedAt
        });
      } catch (momentumError) {
        console.warn("SYNAPSE Momentum AI usage sync failed:", momentumError?.message || momentumError);
      }
    };

    try {
      let idToken = "";

      try {
        idToken = user?.getIdToken ? await user.getIdToken() : "";
      } catch (tokenError) {
        console.warn("SYNAPSE AI personalization token unavailable:", tokenError?.message || tokenError);
      }

      const headers = {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson"
      };

      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      let pdfDocumentPayload = initialPdfDocumentPayload;

      if (attachedPdfFile) {
        if (!user?.uid) {
          throw new Error("Sign in before uploading study PDFs.");
        }

        const { uploadPdfDocument } = await import("../../services/pdfDocuments");
        const uploadedDocument = await uploadPdfDocument({
          uid: user.uid,
          file: attachedPdfFile,
          getIdToken: () => idToken,
          onProgress: (state) => {
            setPdfUploadState(state);
            if (state?.message) {
              setAiStatusText(state.message);
            }
          }
        });

        pdfDocumentPayload = serializePdfDocument(uploadedDocument);
        setActiveDocument(uploadedDocument);
        setUploadedFiles((current) => {
          const nextFile = {
            ...getFileMeta(attachedPdfFile),
            id: uploadedDocument.id,
            name: uploadedDocument.title || attachedPdfFile.name,
            fileUrl: uploadedDocument.fileUrl
          };
          const withoutDuplicate = current.filter((item) => item.id !== nextFile.id);
          return [nextFile, ...withoutDuplicate].slice(0, 12);
        });
      }

      const usePdfEndpoint = Boolean(pdfDocumentPayload?.extractedText);
      const endpoint = usePdfEndpoint ? "/api/pdf/chat" : "/api/chat";
      const requestBody = usePdfEndpoint
        ? {
            messages: nextMessages,
            stream: true,
            uid: user?.uid || "",
            action: options.pdfAction || "",
            document: pdfDocumentPayload
          }
        : {
          messages: nextMessages,
          stream: true,
          uid: user?.uid || "",
          voiceMode: isVoiceRequest,
          latestPrompt: trimmed,   // ← ADD THIS LINE
          uploadedDocumentNames: uploadedFiles.map((file) => file.name).slice(0, 12)
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      const responseType = response.headers.get("content-type") || "";

      if (response.ok && response.body && responseType.includes("application/x-ndjson")) {
        assistantMessageId = `assistant-${Date.now()}`;
        const assistantCreatedAt = new Date().toISOString();

        const ensureAssistantMessage = () => {
          if (hasAssistantMessage) return;

          hasAssistantMessage = true;
          setLoading(false);
          updateConversation(targetId, (current) => ({
            ...current,
            updatedAt: assistantCreatedAt,
            messages: [
              ...current.messages,
              {
                id: assistantMessageId,
                role: "assistant",
                content: "",
                createdAt: assistantCreatedAt
              }
            ]
          }));
        };

        await readSynapseAiStream(response, {
          onToken(token) {
            if (!token) return;

            ensureAssistantMessage();
            streamedContent += token;
            updateConversation(targetId, (current) => ({
              ...current,
              updatedAt: assistantCreatedAt,
              messages: current.messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: streamedContent
                    }
                  : message
              )
            }));
          }
        });

        if (!streamedContent.trim()) {
          throw new Error(SAFE_AI_ERROR);
        }

        await recordAiMomentum();
        if (shouldSpeakResponse && voiceRunIsCurrent()) {
          speakAiResponse(streamedContent);
        }
        return;
      }

      const data = await safelyReadChatJson(response);

      if (!response.ok) {
        throw new Error(data.message || SAFE_AI_ERROR);
      }

      if (!data?.message || typeof data.message !== "string") {
        throw new Error(SAFE_AI_ERROR);
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message,
        createdAt: new Date().toISOString()
      };

      updateConversation(targetId, (current) => ({
        ...current,
        updatedAt: assistantMessage.createdAt,
        messages: [...current.messages, assistantMessage]
      }));

      await recordAiMomentum();
      if (shouldSpeakResponse && voiceRunIsCurrent()) {
        speakAiResponse(data.message);
      }
    } catch (error) {
      if (shouldSpeakResponse && voiceRunIsCurrent()) {
        updateVoiceStatus("idle");
        setVoiceError(error.message || SAFE_AI_ERROR);
      }

      if (hasAssistantMessage && assistantMessageId) {
        const safeError = error.message || SAFE_AI_ERROR;

        updateConversation(targetId, (current) => ({
          ...current,
          updatedAt: new Date().toISOString(),
          messages: current.messages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: message.content?.trim() ? `${message.content}\n\n${safeError}` : safeError
                }
              : message
          )
        }));
        return;
      }

      const errorMessage = {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: error.message || SAFE_AI_ERROR,
        createdAt: new Date().toISOString()
      };

      updateConversation(targetId, (current) => ({
        ...current,
        updatedAt: errorMessage.createdAt,
        messages: [...current.messages, errorMessage]
      }));
    } finally {
      setLoading(false);
      setAiStatusText("");
      if (attachedPdfFile) {
        window.setTimeout(() => {
          setPdfUploadState({
            stage: "idle",
            progress: 0,
            message: ""
          });
        }, 900);
      }
      if (shouldSpeakResponse && voiceRunIsCurrent() && voiceStatusRef.current === "processing") {
        updateVoiceStatus("idle");
      }
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <main
      className="site-shell synapse-ai-shell"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="ambient-grid" aria-hidden="true" />

      <div className={`synapse-ai-frame ${sidebarOpen ? "history-open" : "history-closed"}`}>
        {sidebarOpen ? (
          <button
            className="synapse-ai-scrim"
            type="button"
            aria-label="Close chat history"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onNewChat={handleNewChat}
          onOpenChat={(id) => {
            setActiveId(id);
            setSidebarOpen(false);
          }}
          onDeleteChat={handleDeleteChat}
          open={sidebarOpen}
          onClose={() => setSidebarOpen((value) => !value)}
        />

        <section className="synapse-ai-workspace">
          <header className="synapse-ai-topbar">
            <button
              className="icon-button menu-button"
              type="button"
              aria-label="Toggle workspace sidebar"
              onClick={() => setSidebarOpen((value) => !value)}
            >
              <Menu size={22} />
            </button>

            <div className="synapse-ai-actions">
              <ProfileAvatarMenu
                user={user}
                profile={profile}
                studentName={studentName}
                modeLabel="Focus Mode"
                onProfileUpdate={setProfile}
              />
            </div>
          </header>

          <div className="synapse-ai-layout">
            <section className="synapse-chat-panel">
              <div className="workspace-quick-actions">
                {quickActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={action.label}
                      type="button"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.26, delay: index * 0.04 }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handlePrompt(action.prompt)}
                    >
                      <Icon size={18} />
                      <span>
                        <strong>{action.label}</strong>
                        <small>
                          {action.label === "Ask PDF"
                            ? "Use document context"
                            : action.label === "Solve Doubt"
                              ? "Clear explanations"
                              : action.label === "Study Plan"
                                ? "Plan your week"
                                : action.label === "Explain Topic"
                                  ? "Simple examples"
                                  : "Focus support"}
                        </small>
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="synapse-chat-stream" ref={streamRef}>
                <AnimatePresence initial={false}>
                  {(activeConversation?.messages || []).map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      studentName={studentName}
                      onCopy={copyMessage}
                      onMessageAction={handleMessageAction}
                    />
                  ))}
                </AnimatePresence>

                {loading ? (
                  <motion.div
                    className="synapse-message from-ai is-typing"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <span className="message-avatar" aria-hidden="true">
                      <Image
                        src="/assets/synapse-icon-cropped.png"
                        alt=""
                        width={28}
                        height={28}
                      />
                    </span>
                    <div className="message-shell">
                      <ThinkingIndicator label={aiStatusText} />
                    </div>
                  </motion.div>
                ) : null}
              </div>

              <div className={`pdf-drop-layer ${dragging ? "is-visible" : ""}`}>
                <Upload size={26} />
                <strong>Drop file to attach</strong>
                <span>{SUPPORTED_FILE_COPY}</span>
              </div>

              <motion.div
                className="synapse-ai-composer"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, delay: 0.1 }}
              >
                {selectedFile ? (
                  <div className="composer-file-preview">
                    <SelectedFileIcon size={18} />
                    <span>
                      <strong>{selectedFile.name}</strong>
                      <small>{fileSize(selectedFile.size)} ready</small>
                    </span>
                    <button type="button" aria-label="Remove file" onClick={() => setSelectedFile(null)}>
                      <X size={16} />
                    </button>
                  </div>
                ) : null}

                {activeDocument && !selectedFile ? (
                  <ActivePdfStrip
                    documentData={activeDocument}
                    onClear={() => setActiveDocument(null)}
                    onAction={handlePdfAction}
                  />
                ) : null}

                {uploadError ? <p className="composer-error">{uploadError}</p> : null}

                <label className="composer-input-shell">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={activeDocument ? `Ask about ${activeDocument.title || "your PDF"}...` : "Ask anything..."}
                    rows={1}
                    aria-label="Ask SYNAPSE AI"
                  />
                </label>

                <div className="composer-toolbar">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,image/png,image/jpeg,.html,.htm,.txt,.md,.js,.jsx,.css,.json"
                    className="hidden-file-input"
                    onChange={(event) => {
                      handleFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <VoiceModeOrb
                    status={voiceStatus}
                    transcript={voiceTranscript}
                    interimTranscript={voiceInterimTranscript}
                    error={voiceError}
                    noticeDismissed={voiceNoticeDismissed}
                    onToggle={handleVoiceToggle}
                    onStop={stopVoiceMode}
                  />
                  <div className="attachment-plus-wrap" ref={attachmentMenuRef}>
                    <motion.button
                      className="attachment-plus-button"
                      type="button"
                      onClick={() => setAttachmentMenuOpen((value) => !value)}
                      aria-label="Open attachment menu"
                      whileHover={{ y: -2, scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Paperclip size={19} />
                    </motion.button>
                    <AnimatePresence>
                      {attachmentMenuOpen ? (
                        <motion.div
                          className="attachment-menu"
                          initial={{ opacity: 0, y: 10, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.18 }}
                        >
                          <button type="button" onClick={() => openFilePicker(".pdf,application/pdf")}>
                            <FileText size={17} />
                            <span>Attach PDF</span>
                          </button>
                          <button type="button" onClick={() => openFilePicker("image/png,image/jpeg")}>
                            <ImageIcon size={17} />
                            <span>Upload image</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openFilePicker(".html,.htm,.txt,.md,.js,.jsx,.css,.json,text/*,application/json")
                            }
                          >
                            <FileCode2 size={17} />
                            <span>Upload file</span>
                          </button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <motion.button
                    className="send-ai-button"
                    type="button"
                    onClick={handleSend}
                    disabled={loading || (!input.trim() && !selectedFile && !activeDocument)}
                    whileHover={{ y: -2, scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Send message"
                  >
                    <Send size={20} />
                  </motion.button>
                </div>
              </motion.div>

              <p className="synapse-ai-disclaimer">
                SYNAPSE AI can make mistakes. Check important study, code, and planning details.
              </p>
            </section>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {toastMessage ? (
          <motion.div
            className="copy-toast"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
          >
            {toastMessage}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
