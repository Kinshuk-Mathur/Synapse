import PDFParse from "pdf-parse";
import {
  cleanPdfText,
  normalizePdfTitle,
  PDF_LIMITS,
  splitPdfTextIntoChunks,
  truncateExtractedTextForFirestore
} from "../../../../utils/pdfParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function readJsonBody(req) {
  const rawBody = await req.text();

  if (!rawBody.trim()) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Malformed PDF extraction request.");
  }
}

async function readRequestPayload(req) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("Choose a valid PDF file.");
    }

    const fileSize = Number(formData.get("fileSize") || file.size || 0);
    assertPdfSize(fileSize, file.size);

    return {
      fileName: String(formData.get("fileName") || file.name || "Study PDF.pdf"),
      fileSize,
      buffer: Buffer.from(await file.arrayBuffer())
    };
  }

  const body = await readJsonBody(req);
  assertPdfSize(body.fileSize, 0);

  return {
    fileName: body.fileName,
    fileSize: body.fileSize,
    buffer: await fetchPdfBuffer(body.fileUrl, body.fileSize)
  };
}

function assertPdfSize(fileSize, headerSize) {
  const declaredSize = Number(fileSize || 0);
  const detectedSize = Number(headerSize || 0);
  const size = Math.max(declaredSize, detectedSize);

  if (size > PDF_LIMITS.maxFileSizeBytes) {
    throw new Error("This PDF is above the 10 MB study upload limit.");
  }
}

async function fetchPdfBuffer(fileUrl, fileSize) {
  if (!fileUrl || typeof fileUrl !== "string") {
    throw new Error("A valid PDF download URL is required.");
  }

  const response = await fetch(fileUrl, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("SYNAPSE could not download this PDF for extraction.");
  }

  assertPdfSize(fileSize, response.headers.get("content-length"));

  const contentType = response.headers.get("content-type") || "";

  if (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    throw new Error("The uploaded file does not look like a PDF.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  assertPdfSize(fileSize, buffer.byteLength);

  return buffer;
}

export async function POST(req) {
  try {
    const payload = await readRequestPayload(req);

    // Correct pdf-parse usage — single call, not constructor
    const pdfData = await PDFParse(payload.buffer, {
      // Limit pages processed to avoid timeout on huge PDFs
      max: PDF_LIMITS.maxPages + 1
    });

    const pageCount = Number(pdfData.numpages || 0);

    if (pageCount > PDF_LIMITS.maxPages) {
      return jsonResponse({
        message: `This PDF has ${pageCount} pages. SYNAPSE limit is ${PDF_LIMITS.maxPages} pages.`
      }, 413);
    }

    const cleanedText = cleanPdfText(pdfData.text || "");

    if (!cleanedText || cleanedText.length < 80) {
      return jsonResponse({
        message: "SYNAPSE could not find readable text in this PDF. It may be scanned or image-only."
      }, 422);
    }

    const stored = truncateExtractedTextForFirestore(cleanedText);
    const chunks = splitPdfTextIntoChunks(stored.text);
    const metadataTitle = pdfData.info?.Title && String(pdfData.info.Title).trim();

    return jsonResponse({
      title: metadataTitle || normalizePdfTitle(payload.fileName),
      extractedText: stored.text,
      textTruncated: stored.truncated,
      pageCount,
      chunkCount: chunks.length,
      charCount: stored.text.length
    });

  } catch (error) {
    console.error("[SYNAPSE PDF] Extraction failed:", error?.message || error);
    return jsonResponse({
      message: error?.message || "SYNAPSE could not read this PDF."
    }, 400);
  }
}