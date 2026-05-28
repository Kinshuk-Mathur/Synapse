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
  const idTokenPromise = Promise.resolve(getIdToken?.() || "").catch(() => "");
  const extractionPromise = idTokenPromise
    .then((idToken) =>
      extractPdfFile({
        file,
        idToken
      })
    )
    .catch((error) => error);
  let fileUrl = "";

  onProgress?.({
    stage: "uploading",
    progress: 4,
    message: "Uploading PDF to SYNAPSE cloud..."
  });

  const uploadTask = uploadBytesResumable(storageReference, file, {
    contentType: "application/pdf",
    customMetadata: {
      uid,
      documentId,
      originalName: file.name
    }
  });

  await new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        const progress = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 62)
          : 18;

        onProgress?.({
          stage: "uploading",
          progress: Math.max(4, Math.min(76, progress + 12)),
          message: `Uploading PDF... ${Math.min(100, percent)}%`
        });
      },
      reject,
      resolve
    );
  });

  fileUrl = await getDownloadURL(storageReference);

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

    const documentPayload = {
      title: extraction.title || normalizePdfTitle(file.name),
      fileName: file.name,
      fileUrl,
      storagePath,
      extractedText: extraction.extractedText,
      textTruncated: Boolean(extraction.textTruncated),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      pageCount: extraction.pageCount || 0,
      fileSize: file.size,
      fileSizeLabel: formatPdfFileSize(file.size),
      chunkCount: extraction.chunkCount || 0,
      uid
    };

    setDoc(doc(getDocumentsCollection(uid), documentId), documentPayload).catch((error) => {
      console.warn("SYNAPSE PDF Firestore save failed:", error?.message || error);
    });

    onProgress?.({
      stage: "complete",
      progress: 100,
      message: "PDF intelligence workspace ready."
    });

    return {
      id: documentId,
      ...documentPayload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    throw error;
  }
}

export { PDF_LIMITS };
