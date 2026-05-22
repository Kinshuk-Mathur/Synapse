const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1";

function getProjectId() {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
}

function getDocumentUrl(collection, documentId) {
  const projectId = getProjectId();

  if (!projectId || !collection || !documentId) {
    return "";
  }

  return `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/${collection}/${documentId}`;
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;

  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }

  if ("mapValue" in value) {
    return parseFirestoreFields(value.mapValue.fields || {});
  }

  return null;
}

function parseFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)])
  );
}

function toFirestoreValue(value) {
  if (value === null || typeof value === "undefined") {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }

  return {
    mapValue: {
      fields: toFirestoreFields(value)
    }
  };
}

function toFirestoreFields(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => typeof value !== "undefined")
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

export async function fetchUserProfileFromFirestore(uid, idToken, requestId = "chat") {
  const url = getDocumentUrl("users", uid);

  if (!url || !idToken) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`
      },
      cache: "no-store"
    });

    if (response.status === 404) {
      console.info(`[SYNAPSE AI ${requestId}] No onboarding profile found for user.`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[SYNAPSE AI ${requestId}] Firestore profile fetch failed: ${response.status} ${errorText.slice(0, 240)}`
      );
      return null;
    }

    const document = await response.json();
    return parseFirestoreFields(document.fields || {});
  } catch (error) {
    console.warn(`[SYNAPSE AI ${requestId}] Firestore profile fetch error:`, error?.message || error);
    return null;
  }
}

export async function saveAiMemoryToFirestore(uid, idToken, data = {}, requestId = "chat") {
  const url = getDocumentUrl("aiMemory", uid);

  if (!url || !idToken) {
    return false;
  }

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: toFirestoreFields({
          ...data,
          updatedAt: new Date()
        })
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[SYNAPSE AI ${requestId}] Firestore AI memory save failed: ${response.status} ${errorText.slice(0, 240)}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[SYNAPSE AI ${requestId}] Firestore AI memory save error:`, error?.message || error);
    return false;
  }
}
