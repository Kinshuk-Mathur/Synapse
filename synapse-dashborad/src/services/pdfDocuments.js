import {
  collection,
  doc,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable
} from "firebase/storage";
import { getFirebaseDb, getFirebaseStorage } from "../lib/firebase";
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
  const storagePath = `pdfs/${uid}/${documentId}.pdf`;
  const storageReference = ref(getFirebaseStorage(), storagePath);
  
  onProgress?.({ stage: "uploading", progress: 4, message: "Processing your PDF..." });

// Inside upload progress callback, add more granular messages:
const message = percent < 30
  ? "Uploading your PDF..."
  : percent < 70
  ? "Extracting text content..."
  : percent < 90
  ? "Building AI context..."
  : "Almost ready...";

onProgress?.({
  stage: "uploading",
  progress: Math.max(4, Math.min(70, percent * 0.7)),
  message: `${message} ${percent}%`
});
  
  // Fire BOTH operations at the exact same time — no waiting
  const idToken = await Promise.resolve(getIdToken?.() || "").catch(() => "");
  
  const [uploadResult, extraction] = await Promise.allSettled([
    // Operation 1: Upload to Firebase Storage
    new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageReference, file, {
        contentType: "application/pdf",
        customMetadata: { uid, documentId, originalName: file.name }
      });
  
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const percent = snapshot.totalBytes
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          onProgress?.({
            stage: "uploading",
            progress: Math.max(4, Math.min(70, percent * 0.7)),
            message: `Uploading... ${percent}%`
          });
        },
        reject,
        () => resolve("uploaded")
      );
    }),
  
    // Operation 2: Extract PDF text — starts at the SAME time as upload
    extractPdfFile({ file, idToken })
  ]);
  
  if (uploadResult.status === "rejected") {
    throw new Error("PDF upload failed. Please try again.");
  }
  
  if (extraction.status === "rejected") {
    throw extraction.reason instanceof Error
      ? extraction.reason
      : new Error("SYNAPSE could not read this PDF.");
  }
  
  const fileUrl = await getDownloadURL(storageReference);
  const extractionData = extraction.value;
  
  onProgress?.({
    stage: "analyzing",
    progress: 84,
    message: "Reading PDF intelligence..."
  });

  try {
    const extraction = await extractionPromise;

    if (extraction instanceof Error) {
      throw extraction;
    }

    onProgress?.({
      stage: "saving",
      progress: 90,
      message: "Preparing AI context..."
    });

    const now = new Date();

    const documentPayload = {
      title: extractionData.title || normalizePdfTitle(file.name),
      fileName: file.name,
      fileUrl,
      storagePath,
      extractedText: extractionData.extractedText,
      textTruncated: Boolean(extractionData.textTruncated),
      pageCount: extractionData.pageCount || 0,
      fileSize: file.size,
      fileSizeLabel: formatPdfFileSize(file.size),
      chunkCount: extractionData.chunkCount || 0,
      uid,
      createdAt: serverTimestamp(),   // only for Firestore
      updatedAt: serverTimestamp()    // only for Firestore
    };
    
    // Save to Firestore — non-blocking, don't await
    setDoc(
      doc(getDocumentsCollection(uid), documentId),
      documentPayload
    ).catch((error) => {
      console.warn("SYNAPSE PDF Firestore save failed:", error?.message || error);
    });
    
    onProgress?.({ stage: "complete", progress: 100, message: "PDF ready. Ask me anything." });
    
    // Return serializable object — no Firestore sentinels
    return {
      id: documentId,
      title: extractionData.title || normalizePdfTitle(file.name),
      fileName: file.name,
      fileUrl,
      storagePath,
      extractedText: extractionData.extractedText,
      textTruncated: Boolean(extractionData.textTruncated),
      pageCount: extractionData.pageCount || 0,
      fileSize: file.size,
      fileSizeLabel: formatPdfFileSize(file.size),
      chunkCount: extractionData.chunkCount || 0,
      uid,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
  } catch (error) {
    throw error;
  }
}

export { PDF_LIMITS };
