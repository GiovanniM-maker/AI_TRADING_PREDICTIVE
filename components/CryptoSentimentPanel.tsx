"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface SentimentRecord {
  time?: string;
  date?: string;
  score?: number;
  value?: number;
  classification?: string;
  color?: string;
  source?: string;
  updatedAt?: string;
}

interface CryptoSentimentPanelProps {
  symbol: string;
  className?: string;
}

function resolveScoreColor(score?: number, fallback?: string) {
  if (fallback) return fallback;
  if (typeof score !== "number" || Number.isNaN(score)) return "#9ca3af";
  if (score >= 60) return "#00C853";
  if (score >= 40) return "#FFD600";
  return "#FF1744";
}

export default function CryptoSentimentPanel({ symbol, className }: CryptoSentimentPanelProps) {
  const [latest, setLatest] = useState<SentimentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    let cancelled = false;

    const sentimentRef = collection(doc(db, "crypto_prices", symbol), "sentiment");
    const latestQuery = query(sentimentRef, orderBy("time", "desc"), limit(1));

    const unsubscribe = onSnapshot(
      latestQuery,
      (snapshot) => {
        if (cancelled) return;
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as SentimentRecord;
          setLatest(data ?? null);
        } else {
          setLatest(null);
        }
        setLoading(false);
      },
      (err) => {
        if (!cancelled) {
          console.error("Sentiment latest error", err);
          setError(err?.message ?? "Impossibile recuperare il market sentiment.");
          setLatest(null);
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [symbol]);

  const resolvedScore = useMemo(() => {
    if (!latest) return null;
    if (typeof latest.score === "number") return latest.score;
    if (typeof latest.value === "number") return latest.value;
    return null;
  }, [latest]);

  const sentimentColor = resolveScoreColor(resolvedScore ?? undefined, latest?.color);

  const updatedLabel = useMemo(() => {
    const iso = latest?.updatedAt ?? latest?.time ?? null;
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString();
    } catch (err) {
      return iso;
    }
  }, [latest]);

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-6 ${className ?? ""}`}>
      <h3 className="text-lg font-semibold">Market Sentiment</h3>
      {loading ? (
        <p className="text-sm text-gray-400 mt-2">Caricamento sentiment...</p>
      ) : error ? (
        <p className="text-sm text-red-400 mt-2">{error}</p>
      ) : latest && resolvedScore != null ? (
        <div className="mt-6 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Score</p>
            <p className="text-4xl font-bold" style={{ color: sentimentColor }}>
              {Math.round(resolvedScore)}
            </p>
          </div>
          {latest.classification && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">State</p>
              <p className="text-sm text-gray-200 font-medium">{latest.classification}</p>
            </div>
          )}
          {latest.source && (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Source</p>
              <p className="text-sm text-gray-300">{latest.source}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Updated</p>
            <p className="text-xs text-gray-400">{updatedLabel}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mt-2">
          Nessun sentiment disponibile per questa crypto.
        </p>
      )}
    </div>
  );
}
