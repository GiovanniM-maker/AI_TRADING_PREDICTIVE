import { getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { monitor, logError } from "@/lib/monitor";

// Log monitor reference (for debugging)
if (typeof window !== "undefined") {
  console.log("[FIRESTORE] Monitor ref:", monitor);
}

export async function monitoredGetDocs(ref) {
  console.log("[FIRESTORE] monitoredGetDocs called");
  try {
    monitor.firestoreReads++;
    monitor.firestoreLastReadTime = Date.now();
    console.log("[FIRESTORE] monitoredGetDocs success - firestoreReads:", monitor.firestoreReads, "monitor:", monitor);
    return await getDocs(ref);
  } catch (err) {
    logError(err);
    throw err;
  }
}

export async function monitoredGetDoc(ref) {
  try {
    monitor.firestoreReads++;
    monitor.firestoreLastReadTime = Date.now();
    return await getDoc(ref);
  } catch (err) {
    logError(err);
    throw err;
  }
}

export async function monitoredSetDoc(ref, data, options) {
  try {
    monitor.firestoreWrites++;
    monitor.firestoreLastWriteTime = Date.now();
    return await setDoc(ref, data, options);
  } catch (err) {
    logError(err);
    throw err;
  }
}

export async function monitoredUpdateDoc(ref, data) {
  try {
    monitor.firestoreWrites++;
    monitor.firestoreLastWriteTime = Date.now();
    return await updateDoc(ref, data);
  } catch (err) {
    logError(err);
    throw err;
  }
}

