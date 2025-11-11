"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  historyLimit?: number;
}

function resolveScoreColor(score?: number, fallback?: string) {
  if (fallback) return fallback;
  if (typeof score !== "number" || Number.isNaN(score)) return "#9ca3af";
  if (score >= 60) return "#00C853";
  if (score >= 40) return "#FFD600";
  return "#FF1744";
}

export default function CryptoSentimentPanel({
  symbol,
  className,
  historyLimit = 90,
}: CryptoSentimentPanelProps) {
  const [latest, setLatest] = useState<SentimentRecord | null>(null);
  const [history, setHistory] = useState<SentimentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    let cancelled = false;

    const sentimentRef = collection(
      doc(db, "crypto_prices", symbol),
      "sentiment"
    );

    const latestQuery = query(
      sentimentRef,
      orderBy("time", "desc"),
      limit(1)
    );
    const historyQuery = query(
      sentimentRef,
      orderBy("time", "desc"),
      limit(historyLimit)
    );

    const unsubscribeLatest = onSnapshot(
      latestQuery,
      (snapshot) => {
        if (cancelled) return;
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as SentimentRecord;
          setLatest(data);
        } else {
          setLatest(null);
        }
      },
      (err) => {
        if (!cancelled) {
          console.error("Sentiment latest error", err);
          setError(
            err?.message ?? "Impossibile recuperare l'ultimo sentiment."
          );
          setLatest(null);
        }
      }
    );

    const unsubscribeHistory = onSnapshot(
      historyQuery,
      (snapshot) => {
        if (cancelled) return;
        const records = snapshot.docs
          .map((docSnap) => docSnap.data() as SentimentRecord)
          .filter((item) =>
            typeof (item?.time ?? item?.updatedAt ?? item?.date) === "string"
          )
          .sort((a, b) => {
            const aDate = new Date(
              a.time ?? a.updatedAt ?? `${a.date ?? "1970-01-01"}T00:00:00.000Z`
            ).getTime();
            const bDate = new Date(
              b.time ?? b.updatedAt ?? `${b.date ?? "1970-01-01"}T00:00:00.000Z`
            ).getTime();
            return aDate - bDate;
          });
        setHistory(records);
        setLoading(false);
      },
      (err) => {
        if (!cancelled) {
          console.error("Sentiment history error", err);
          setError(
            err?.message ?? "Impossibile recuperare la cronologia del sentiment."
          );
          setHistory([]);
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribeLatest();
      unsubscribeHistory();
    };
  }, [symbol, historyLimit]);

  const resolvedScore = useMemo(() => {
    if (!latest) return null;
    const raw =
      typeof latest.score === "number"
        ? latest.score
        : typeof latest.value === "number"
        ? latest.value
        : null;
    return raw;
  }, [latest]);

  const sentimentColor = resolveScoreColor(resolvedScore ?? undefined, latest?.color);

  const chartData = useMemo(
    () =>
      history.map((item) => ({
        date:
          item.date ??
          new Date(
            item.time ?? item.updatedAt ?? `${item.date ?? "1970-01-01"}T00:00:00.000Z`
          )
            .toISOString()
            .slice(0, 10),
        score:
          typeof item.score === "number"
            ? item.score
            : typeof item.value === "number"
            ? item.value
            : null,
        color: resolveScoreColor(
          typeof item.score === "number" ? item.score : item.value,
          item.color
        ),
      })),
    [history]
  );

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
    <div
      className={`bg-gray-900 border border-gray-800 rounded-xl h-full flex flex-col ${
        className ?? ""
      }`}
    >
      <div className="p-6 border-b border-gray-800">
        <h3 className="text-lg font-semibold">Market Sentiment</h3>
        {loading ? (
          <p className="text-sm text-gray-400 mt-2">Caricamento sentiment...</p>
        ) : error ? (
          <p className="text-sm text-red-400 mt-2">{error}</p>
        ) : latest && resolvedScore != null ? (
          <div className="mt-4">
            <p
              className="text-4xl font-bold"
              style={{ color: sentimentColor }}
            >
              {Math.round(resolvedScore)}
            </p>
            {latest?.classification && (
              <p className="text-sm text-gray-300 mt-1">
                {latest.classification}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">Aggiornato: {updatedLabel}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-2">
            Nessun sentiment disponibile per questa crypto.
          </p>
        )}
      </div>

      <div className="p-6 flex-1">
        {chartData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="date"
                  stroke="#6B7280"
                  tickFormatter={(value) => value?.slice?.(5) ?? value}
                />
                <YAxis stroke="#6B7280" domain={[0, 100]} tickCount={6} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "none",
                    borderRadius: "0.75rem",
                  }}
                  formatter={(value) => [`${value}`, "Score"]}
                  labelFormatter={(label) => label}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#00C853"
                  strokeWidth={2}
                  dot={{ r: 2, strokeWidth: 1, fill: "#00C853" }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : loading ? (
          <p className="text-sm text-gray-400">Caricamento storico...</p>
        ) : (
          <p className="text-sm text-gray-400">
            Nessun dato storico di sentiment disponibile.
          </p>
        )}
      </div>
    </div>
  );
}
