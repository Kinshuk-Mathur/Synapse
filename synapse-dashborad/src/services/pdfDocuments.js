import {
  collection,
  doc,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import {
  formatPdfFileSize,
  normalizePdfTitle,
  PDF_LIMITS,
  validatePdfUpload
} from "../utils/pdfParser";

export const PDF_DOCUMENTS_COLLECTION = "documents";

function createDocumentId() {
  return globalThis.crypto?.randomUUID?.() || `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDocumentsCollection(uid) {
  return collection(getFirebaseDb(), "users", uid, PDF_DOCUMENTS_COLLECTION);
}

export async function extractPdfFile({ file, idToken }) {
  const headers = {};

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", file.name);
  formData.append("fileSize", String(file.size));

  const response = await fetch("/api/pdf/extract", {
    method: "POST",
    headers,
    body: formData
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "SYNAPSE could not extract this PDF.");
  }

  return data;
}

export async function uploadPdfDocument({ uid, file, getIdToken, onProgress }) {
  const validationError = validatePdfUpload(file);

  if (validationError) {
    throw new Error(validationError);
  }

  if (!uid) {
    throw new Error("Sign in before uploading study PDFs.");
  }

  const documentId = createDocumentId();

  onProgress?.({
    stage: "uploading",
    progress: 10,
    message: "Reading your PDF..."
  });

  const idToken = await Promise.resolve(getIdToken?.() || "").catch(() => "");

  onProgress?.({
    stage: "uploading",
    progress: 30,
    message: "Extracting text content..."
  });

  // Extract text only — no Firebase Storage needed
  const extraction = await extractPdfFile({ file, idToken });

  onProgress?.({
    stage: "analyzing",
    progress: 70,
    message: "Building AI context..."
  });

  const now = new Date();

  const documentPayload = {
    title: extraction.title || normalizePdfTitle(file.name),
    fileName: file.name,
    fileUrl: "",
    storagePath: "",
    extractedText: extraction.extractedText,
    textTruncated: Boolean(extraction.textTruncated),
    pageCount: extraction.pageCount || 0,
    fileSize: file.size,
    fileSizeLabel: formatPdfFileSize(file.size),
    chunkCount: extraction.chunkCount || 0,
    uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  // Save to Firestore — non-blocking, don't await
  setDoc(
    doc(getDocumentsCollection(uid), documentId),
    documentPayload
  ).catch((error) => {
    console.warn("SYNAPSE PDF Firestore save failed:", error?.message || error);
  });

  onProgress?.({
    stage: "complete",
    progress: 100,
    message: "PDF ready. Ask me anything."
  });

  // Return serializable object — no Firestore sentinels
  return {
    id: documentId,
    title: extraction.title || normalizePdfTitle(file.name),
    fileName: file.name,
    fileUrl: "",
    storagePath: "",
    extractedText: extraction.extractedText,
    textTruncated: Boolean(extraction.textTruncated),
    pageCount: extraction.pageCount || 0,
    fileSize: file.size,
    fileSizeLabel: formatPdfFileSize(file.size),
    chunkCount: extraction.chunkCount || 0,
    uid,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export { PDF_LIMITS };