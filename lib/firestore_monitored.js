import { getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

export async function monitoredGetDocs(ref) {
  return await getDocs(ref);
}

export async function monitoredGetDoc(ref) {
  return await getDoc(ref);
}

export async function monitoredSetDoc(ref, data, options) {
  return await setDoc(ref, data, options);
}

export async function monitoredUpdateDoc(ref, data) {
  return await updateDoc(ref, data);
}

