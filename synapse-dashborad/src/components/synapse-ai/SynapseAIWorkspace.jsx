"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Globe2,
  GraduationCap,
  Heart,
  History,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  Paperclip,
  PenLine,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSynapseTheme } from "../../hooks/useSynapseTheme";
import TodoThemeSwitcher from "../todo/TodoThemeSwitcher";

const STORAGE_KEY = "synapse-ai-conversations";

const quickActions = [
  {
    label: "Summarize PDF",
    icon: FileText,
    prompt: "Summarize this PDF into key points, formulas, definitions, and a revision checklist."
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
    prompt: "Help me plan a calm, productive day with priorities, breaks, and focus sessions."
  }
];

const toolItems = [
  {
    label: "Study Mode",
    description: "Tutor-style explanations",
    icon: GraduationCap
  },
  {
    label: "PDF Summary",
    description: "Prepare file insights",
    icon: FileText
  },
  {
    label: "Web Research",
    description: "Ready for future search",
    icon: Globe2
  },
  {
    label: "Task Builder",
    description: "Turn answers into plans",
    icon: PenLine
  }
];

function createWelcomeMessage() {
  return {
    id: "welcome",
    role: "assistant",
    content:
      "Hi, I am SYNAPSE AI. Ask a study doubt, plan your week, or upload a PDF and I will help you turn it into clear next steps.",
    createdAt: new Date().toISOString(),
    synthetic: true
  };
}

function createConversation() {
  const now = new Date().toISOString();

  return {
    id: `chat-${Date.now()}`,
    title: "New Chat",
    updatedAt: now,
    messages: [createWelcomeMessage()]
  };
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

function makeTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
}

function MarkdownMessage({ content }) {
  const parts = String(content).split(/```/g);

  return (
    <div className="synapse-markdown">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const lines = part.replace(/^\w+\n/, "").trim();

          return (
            <pre key={`${part}-${index}`}>
              <code>{lines}</code>
            </pre>
          );
        }

        return part
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((block, blockIndex) => {
            const lines = block.split("\n").filter(Boolean);
            const isList = lines.every((line) => /^[-*]\s+/.test(line.trim()));

            if (isList) {
              return (
                <ul key={`${block}-${blockIndex}`}>
                  {lines.map((line) => (
                    <li key={line}>{line.replace(/^[-*]\s+/, "")}</li>
                  ))}
                </ul>
              );
            }

            return (
              <p key={`${block}-${blockIndex}`}>
                {lines.map((line, lineIndex) => (
                  <span key={`${line}-${lineIndex}`}>
                    {line}
                    {lineIndex < lines.length - 1 ? <br /> : null}
                  </span>
                ))}
              </p>
            );
          });
      })}
    </div>
  );
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

function MessageBubble({ message, onCopy }) {
  const fromUser = message.role === "user";

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
            <FileText size={15} />
            <span>{message.attachment.name}</span>
          </div>
        ) : null}

        <MarkdownMessage content={message.content} />

        <footer>
          <time>{formatTime(message.createdAt)}</time>
          {!fromUser ? (
            <span className="message-actions">
              <button type="button" onClick={() => onCopy(message.content)} aria-label="Copy response">
                <Copy size={15} />
              </button>
              <button type="button" aria-label="Like response">
                <ThumbsUp size={15} />
              </button>
              <button type="button" aria-label="Dislike response">
                <ThumbsDown size={15} />
              </button>
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
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            className="synapse-ai-scrim"
            type="button"
            aria-label="Close chat history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        className={`synapse-ai-sidebar ${open ? "is-open" : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.42 }}
      >
        <div className="synapse-ai-brand">
          <Image
            src="/assets/main-logo.jpeg"
            alt="SYNAPSE logo"
            width={186}
            height={74}
            priority
          />
          <button type="button" aria-label="Close sidebar" onClick={onClose}>
            <PanelLeftClose size={18} />
          </button>
        </div>

        <motion.button
          className="new-ai-chat-button"
          type="button"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNewChat}
        >
          <Plus size={18} />
          <span>New Chat</span>
        </motion.button>

        <div className="chat-history-label">
          <History size={15} />
          <span>Chat History</span>
        </div>

        <div className="synapse-history-list">
          {sorted.map((conversation) => (
            <motion.div
              key={conversation.id}
              className={`history-row ${conversation.id === activeId ? "is-active" : ""}`}
              whileHover={{ x: 3 }}
            >
              <button type="button" onClick={() => onOpenChat(conversation.id)}>
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
          ))}
        </div>

        <div className="synapse-sidebar-user">
          <Image
            src="/assets/synapse-icon-cropped.png"
            alt="Student profile"
            width={42}
            height={42}
          />
          <div>
            <strong>Focus Mode</strong>
            <span>Student workspace</span>
          </div>
          <Heart size={16} />
        </div>
      </motion.aside>
    </>
  );
}

function RightRail({ onPrompt, selectedFile }) {
  return (
    <aside className="synapse-ai-rail">
      <section>
        <div className="rail-heading">
          <WandSparkles size={18} />
          <h2>Tools</h2>
        </div>
        <div className="tool-list">
          {toolItems.map((tool) => {
            const Icon = tool.icon;
            return (
              <button key={tool.label} type="button" onClick={() => onPrompt(tool.label)}>
                <span className="tool-icon">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{tool.label}</strong>
                  <small>{tool.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="rail-heading">
          <FileText size={18} />
          <h2>Recent File</h2>
        </div>
        <div className="recent-file-card">
          <FileText size={18} />
          <span>
            <strong>{selectedFile?.name || "No PDF selected"}</strong>
            <small>{selectedFile ? fileSize(selectedFile.size) : "Upload a file from the composer"}</small>
          </span>
        </div>
      </section>
    </aside>
  );
}

export default function SynapseAIWorkspace() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const { theme, applyTheme } = useSynapseTheme();
  const { user } = useAuth();

  const studentName = user?.displayName?.split(" ")[0] || "Kinshuk";
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      const valid = Array.isArray(saved) && saved.length > 0 ? saved : [createConversation()];

      setConversations(valid);
      setActiveId(valid[0].id);
    } catch {
      const firstConversation = createConversation();
      setConversations([firstConversation]);
      setActiveId(firstConversation.id);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, hydrated]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [activeConversation?.messages.length, loading]);

  const updateConversation = (conversationId, updater) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation
      )
    );
  };

  const handleNewChat = () => {
    const nextConversation = createConversation();
    setConversations((current) => [nextConversation, ...current]);
    setActiveId(nextConversation.id);
    setInput("");
    setSelectedFile(null);
    setUploadError("");
    setSidebarOpen(false);
  };

  const handleDeleteChat = (conversationId) => {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== conversationId);

      if (!next.length) {
        const fresh = createConversation();
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
    setToolsOpen(false);
  };

  const handleFile = (file) => {
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setUploadError("Only PDF files are supported right now.");
      return;
    }

    setUploadError("");
    setSelectedFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const copyMessage = async (content) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    const conversation = conversations.find((item) => item.id === activeId);
    const targetId = activeId;

    if (!conversation || loading || (!trimmed && !selectedFile)) return;

    const now = new Date().toISOString();
    const attachmentText = selectedFile ? `\n\nAttached PDF: ${selectedFile.name}` : "";
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: `${trimmed || "Please summarize this PDF."}${attachmentText}`,
      createdAt: now,
      attachment: selectedFile
        ? {
            name: selectedFile.name,
            size: selectedFile.size
          }
        : null
    };
    const baseMessages = conversation.messages.filter((message) => !message.synthetic);
    const nextMessages = [...baseMessages, userMessage]
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    updateConversation(targetId, (current) => ({
      ...current,
      title: current.title === "New Chat" ? makeTitle(trimmed || selectedFile?.name || "PDF Summary") : current.title,
      updatedAt: now,
      messages: [...current.messages, userMessage]
    }));

    setInput("");
    setSelectedFile(null);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SYNAPSE AI is unavailable right now.");
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message || "I could not generate a response. Try again with a little more detail.",
        createdAt: new Date().toISOString()
      };

      updateConversation(targetId, (current) => ({
        ...current,
        updatedAt: assistantMessage.createdAt,
        messages: [...current.messages, assistantMessage]
      }));
    } catch (error) {
      const errorMessage = {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: error.message || "Something went wrong. Please try again.",
        createdAt: new Date().toISOString()
      };

      updateConversation(targetId, (current) => ({
        ...current,
        updatedAt: errorMessage.createdAt,
        messages: [...current.messages, errorMessage]
      }));
    } finally {
      setLoading(false);
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

      <div className="synapse-ai-frame">
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
          onClose={() => setSidebarOpen(false)}
        />

        <section className="synapse-ai-workspace">
          <header className="synapse-ai-topbar">
            <button
              className="icon-button menu-button"
              type="button"
              aria-label="Open chat history"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>

            <div className="synapse-ai-title">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                AI Chat Workspace
              </motion.span>
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, delay: 0.04 }}
              >
                <span className="synapse-title-brand">synapse</span>
                <span className="synapse-title-ai">AI</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, delay: 0.08 }}
              >
                Your AI Productivity & Study Assistant
              </motion.p>
            </div>

            <div className="synapse-ai-actions">
              <TodoThemeSwitcher theme={theme} onChange={applyTheme} />
              <div className="profile-chip">
                <Image
                  src="/assets/synapse-icon-cropped.png"
                  alt="Student profile"
                  width={36}
                  height={36}
                />
                <div>
                  <strong>{studentName}</strong>
                  <small>Focus Mode</small>
                </div>
              </div>
            </div>
          </header>

          <div className="synapse-ai-layout">
            <section className="synapse-chat-panel">
              <div className="quick-action-row">
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
                      <Icon size={16} />
                      <span>{action.label}</span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="synapse-chat-stream" ref={streamRef}>
                <AnimatePresence initial={false}>
                  {(activeConversation?.messages || []).map((message) => (
                    <MessageBubble key={message.id} message={message} onCopy={copyMessage} />
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
                      <TypingDots />
                    </div>
                  </motion.div>
                ) : null}
              </div>

              <div className={`pdf-drop-layer ${dragging ? "is-visible" : ""}`}>
                <Upload size={26} />
                <strong>Drop PDF to attach</strong>
              </div>

              <motion.div
                className="synapse-ai-composer"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, delay: 0.1 }}
              >
                {selectedFile ? (
                  <div className="composer-file-preview">
                    <FileText size={18} />
                    <span>
                      <strong>{selectedFile.name}</strong>
                      <small>{fileSize(selectedFile.size)} ready</small>
                    </span>
                    <button type="button" aria-label="Remove file" onClick={() => setSelectedFile(null)}>
                      <X size={16} />
                    </button>
                  </div>
                ) : null}

                {uploadError ? <p className="composer-error">{uploadError}</p> : null}

                <label className="composer-input-shell">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    rows={1}
                    aria-label="Ask SYNAPSE AI"
                  />
                </label>

                <div className="composer-toolbar">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden-file-input"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />
                  <button type="button" onClick={() => fileRef.current?.click()}>
                    <Paperclip size={17} />
                    <span>Upload PDF</span>
                  </button>

                  <div className="tools-menu-wrap">
                    <button type="button" onClick={() => setToolsOpen((value) => !value)}>
                      <MoreHorizontal size={17} />
                      <span>Tools</span>
                    </button>
                    <AnimatePresence>
                      {toolsOpen ? (
                        <motion.div
                          className="tools-popover"
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        >
                          {toolItems.map((tool) => {
                            const Icon = tool.icon;
                            return (
                              <button key={tool.label} type="button" onClick={() => handlePrompt(tool.label)}>
                                <Icon size={16} />
                                <span>{tool.label}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePrompt("Improve this answer and make it exam-ready:")}
                  >
                    <WandSparkles size={17} />
                    <span>Improve</span>
                  </button>

                  <motion.button
                    className="send-ai-button"
                    type="button"
                    onClick={handleSend}
                    disabled={loading || (!input.trim() && !selectedFile)}
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

            <RightRail onPrompt={handlePrompt} selectedFile={selectedFile} />
          </div>
        </section>
      </div>

      <AnimatePresence>
        {copied ? (
          <motion.div
            className="copy-toast"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
          >
            Copied response
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
