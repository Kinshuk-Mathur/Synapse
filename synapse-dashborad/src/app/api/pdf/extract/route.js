import { PDFParse } from "pdf-parse";
import {
  cleanPdfText,
  normalizePdfTitle,
  PDF_LIMITS,
  splitPdfTextIntoChunks,
  truncateExtractedTextForFirestore
} from "../../../../utils/pdfParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    const body = await readJsonBody(req);
    assertPdfSize(body.fileSize, 0);

    const buffer = await fetchPdfBuffer(body.fileUrl, body.fileSize);
    const parser = new PDFParse({ data: buffer });

    try {
      const info = await parser.getInfo({ parsePageInfo: false });
      const textResult = await parser.getText();
      const pageCount = Number(textResult?.total || info?.total || 0);

      if (pageCount > PDF_LIMITS.maxPages) {
        return jsonResponse(
          {
            message: `This PDF has ${pageCount} pages. The current SYNAPSE limit is ${PDF_LIMITS.maxPages} pages.`
          },
          413
        );
      }

      const cleanedText = cleanPdfText(textResult?.text || "");

      if (!cleanedText || cleanedText.length < 80) {
        return jsonResponse(
          {
            message:
              "SYNAPSE could not find readable text in this PDF. It may be scanned, image-only, locked, or corrupted."
          },
          422
        );
      }

      const stored = truncateExtractedTextForFirestore(cleanedText);
      const chunks = splitPdfTextIntoChunks(stored.text);
      const metadataTitle = info?.info?.Title && String(info.info.Title).trim();

      return jsonResponse({
        title: metadataTitle || normalizePdfTitle(body.fileName),
        extractedText: stored.text,
        textTruncated: stored.truncated,
        pageCount,
        chunkCount: chunks.length,
        charCount: stored.text.length
      });
    } finally {
      await parser.destroy?.();
    }
  } catch (error) {
    console.error("[SYNAPSE PDF] Extraction failed:", error?.message || error);

    return jsonResponse(
      {
        message:
          error?.message ||
          "SYNAPSE could not read this PDF. Try a cleaner text-based PDF under 10 MB."
      },
      400
    );
  }
}
