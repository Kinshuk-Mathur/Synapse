import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import {
  deleteObject,
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

export function subscribeToPdfDocuments(uid, onNext, onError) {
  if (!uid) {
    onNext([]);
    return () => {};
  }

  const documentsQuery = query(getDocumentsCollection(uid), orderBy("createdAt", "desc"));

  return onSnapshot(
    documentsQuery,
    (snapshot) => {
      onNext(
        snapshot.docs.map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
      );
    },
    onError
  );
}

export async function extractPdfFromStorage({ fileUrl, fileName, fileSize, idToken }) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch("/api/pdf/extract", {
    method: "POST",
    headers,
    body: JSON.stringify({
      fileUrl,
      fileName,
      fileSize
    })
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
          progress: Math.max(4, Math.min(64, progress)),
          message: `Uploading PDF... ${Math.min(100, percent)}%`
        });
      },
      reject,
      resolve
    );
  });

  const fileUrl = await getDownloadURL(storageReference);

  onProgress?.({
    stage: "extracting",
    progress: 70,
    message: "Extracting clean study text..."
  });

  try {
    const idToken = getIdToken ? await getIdToken() : "";
    const extraction = await extractPdfFromStorage({
      fileUrl,
      fileName: file.name,
      fileSize: file.size,
      idToken
    });

    onProgress?.({
      stage: "saving",
      progress: 90,
      message: "Saving intelligence layer..."
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

    await setDoc(doc(getDocumentsCollection(uid), documentId), documentPayload);

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
    await deleteObject(storageReference).catch(() => {});
    throw error;
  }
}

export async function deletePdfDocument(uid, documentData) {
  if (!uid || !documentData?.id) {
    throw new Error("A PDF document id is required.");
  }

  await deleteDoc(doc(getDocumentsCollection(uid), documentData.id));

  if (documentData.storagePath) {
    await deleteObject(ref(getFirebaseStorage(), documentData.storagePath)).catch(() => {});
  }
}

export { PDF_LIMITS };
