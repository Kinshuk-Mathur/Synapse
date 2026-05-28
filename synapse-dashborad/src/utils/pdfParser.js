export const PDF_LIMITS = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxPages: 300,
  chunkSize: 1400,
  chunkOverlap: 160,
  maxStoredTextChars: 880_000
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "between",
  "chapter",
  "could",
  "document",
  "explain",
  "from",
  "have",
  "into",
  "notes",
  "question",
  "should",
  "show",
  "study",
  "summarize",
  "summary",
  "that",
  "their",
  "there",
  "these",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your"
]);

export function isPdfFile(file) {
  if (!file) return false;

  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

export function formatPdfFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function cleanPdfText(value = "") {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/([a-z])-\n([a-z])/gi, "$1$2")
    .replace(/[ \u00a0]*\n[ \u00a0]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([.!?])\n(?=[A-Z0-9])/g, "$1\n\n")
    .replace(/([a-z0-9,;:])\n(?=[a-z0-9(])/gi, "$1 ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizePdfTitle(fileName = "") {
  const clean = String(fileName || "Study Document")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean || "Study Document";
}

export function validatePdfUpload(file) {
  if (!file) {
    return "Choose a PDF to upload.";
  }

  if (!isPdfFile(file)) {
    return "Upload a PDF study document.";
  }

  if (file.size > PDF_LIMITS.maxFileSizeBytes) {
    return `PDF limit is ${formatPdfFileSize(PDF_LIMITS.maxFileSizeBytes)}.`;
  }

  return "";
}

export function splitPdfTextIntoChunks(text = "", options = {}) {
  const source = cleanPdfText(text);
  const chunkSize = options.chunkSize || PDF_LIMITS.chunkSize;
  const overlap = Math.min(options.chunkOverlap ?? PDF_LIMITS.chunkOverlap, Math.floor(chunkSize / 3));

  if (!source) return [];

  const chunks = [];
  let start = 0;

  while (start < source.length) {
    const targetEnd = Math.min(start + chunkSize, source.length);
    let end = targetEnd;

    if (targetEnd < source.length) {
      const paragraphBreak = source.lastIndexOf("\n\n", targetEnd);
      const sentenceBreak = Math.max(
        source.lastIndexOf(". ", targetEnd),
        source.lastIndexOf("? ", targetEnd),
        source.lastIndexOf("! ", targetEnd)
      );
      const bestBreak = Math.max(paragraphBreak, sentenceBreak);

      if (bestBreak > start + chunkSize * 0.55) {
        end = bestBreak + (bestBreak === paragraphBreak ? 2 : 1);
      }
    }

    const content = source.slice(start, end).trim();

    if (content) {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        index: chunks.length,
        content,
        start,
        end
      });
    }

    if (end >= source.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function extractKeywords(query = "") {
  const normalized = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9+\-*/^= ]/g, " ");

  return normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 24);
}

function scoreChunk(chunk, keywords) {
  const content = String(chunk.content || "").toLowerCase();

  return keywords.reduce((score, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactMatches = content.match(new RegExp(`\\b${escaped}\\b`, "g"))?.length || 0;
    const fuzzyMatches = exactMatches ? 0 : content.includes(keyword) ? 1 : 0;

    return score + exactMatches * 3 + fuzzyMatches;
  }, 0);
}

function pickDistributedChunks(chunks, count) {
  if (chunks.length <= count) return chunks;

  const selected = new Map();
  const anchors = [0, Math.floor(chunks.length * 0.25), Math.floor(chunks.length * 0.5), Math.floor(chunks.length * 0.75), chunks.length - 1];

  for (const index of anchors) {
    if (selected.size >= count) break;
    selected.set(chunks[index].id, chunks[index]);
  }

  for (const chunk of chunks) {
    if (selected.size >= count) break;
    selected.set(chunk.id, chunk);
  }

  return Array.from(selected.values()).sort((a, b) => a.index - b.index);
}

export function selectRelevantPdfChunks(text = "", query = "", options = {}) {
  const chunks = splitPdfTextIntoChunks(text, options);
  const maxChunks = options.maxChunks || 7;
  const keywords = extractKeywords(query);

  if (!chunks.length) return [];

  if (!keywords.length || options.mode === "broad") {
    return pickDistributedChunks(chunks, maxChunks);
  }

  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, keywords)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const topMatches = ranked.filter((chunk) => chunk.score > 0).slice(0, maxChunks);
  const selected = topMatches.length ? topMatches : pickDistributedChunks(chunks, maxChunks);

  return selected.sort((a, b) => a.index - b.index);
}

export function buildPdfContextBlock(chunks = []) {
  return chunks
    .map((chunk) => `[Chunk ${chunk.index + 1}]\n${chunk.content}`)
    .join("\n\n---\n\n");
}

export function truncateExtractedTextForFirestore(text = "") {
  const cleaned = cleanPdfText(text);

  if (cleaned.length <= PDF_LIMITS.maxStoredTextChars) {
    return {
      text: cleaned,
      truncated: false
    };
  }

  return {
    text: cleaned.slice(0, PDF_LIMITS.maxStoredTextChars).trim(),
    truncated: true
  };
}
