"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ImportPage() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) window.location.href = "/login";
      else setUser(u);
    });
    return () => unsub();
  }, []);

  const runImport = async () => {
    setStatus("Import in corso...");
    try {
      const res = await fetch("/api/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore import");
      setStatus(`OK: importate ${data.imported} coin/s`);
    } catch (e) {
      setStatus(`Errore: ${e.message}`);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="p-6 bg-gray-900 rounded w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Import iniziale Crypto</h1>
        <p className="text-sm mb-4">
          Importa solo BTC, ETH, SOL, BNB, DOGE, XRP da CoinGecko.
        </p>
        <button
          onClick={runImport}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
        >
          Avvia Import
        </button>
        {status && <p className="mt-4 text-sm">{status}</p>}
      </div>
    </div>
  );
}

