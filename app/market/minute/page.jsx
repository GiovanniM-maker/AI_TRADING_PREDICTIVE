"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COIN_OPTIONS = [
  { value: "BTCUSDT", label: "Bitcoin (BTC)" },
  { value: "ETHUSDT", label: "Ethereum (ETH)" },
  { value: "SOLUSDT", label: "Solana (SOL)" },
  { value: "BNBUSDT", label: "BNB (BNB)" },
  { value: "DOGEUSDT", label: "Dogecoin (DOGE)" },
  { value: "XRPUSDT", label: "Ripple (XRP)" },
];

const RANGE_OPTIONS = [
  { value: "15m", label: "Ultimi 15 minuti", ms: 15 * 60 * 1000 },
  { value: "30m", label: "Ultimi 30 minuti", ms: 30 * 60 * 1000 },
  { value: "1h", label: "Ultima ora", ms: 60 * 60 * 1000 },
  { value: "3h", label: "Ultime 3 ore", ms: 3 * 60 * 60 * 1000 },
  { value: "6h", label: "Ultime 6 ore", ms: 6 * 60 * 60 * 1000 },
  { value: "12h", label: "Ultime 12 ore", ms: 12 * 60 * 60 * 1000 },
  { value: "24h", label: "Ultime 24 ore", ms: 24 * 60 * 60 * 1000 },
  { value: "3d", label: "Ultimi 3 giorni", ms: 3 * 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Ultimi 7 giorni", ms: 7 * 24 * 60 * 60 * 1000 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCurrency(value) {
  if (typeof value !== "number") return "-";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 2 : 4,
    maximumFractionDigits: value >= 100 ? 2 : 6,
  })}`;
}

function calcChange(current, reference) {
  if (
    typeof current !== "number" ||
    typeof reference !== "number" ||
    reference === 0
  ) {
    return null;
  }
  const diff = current - reference;
  const pct = (diff / reference) * 100;
  return { diff, pct };
}

function aggregateForRange(points, rangeMs) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const groupByDay = rangeMs > DAY_MS;
  const map = new Map();

  points.forEach((point) => {
    const date = point?.date instanceof Date ? point.date : null;
    if (!date) return;
    const iso = date.toISOString();
    const key = groupByDay ? iso.slice(0, 10) : iso.slice(0, 13);
    const existing = map.get(key);
    if (!existing || date.getTime() > existing.date.getTime()) {
      map.set(key, point);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

export default function MarketMinutePage() {
  const [user, setUser] = useState(null);
  const [selectedCoin, setSelectedCoin] = useState(COIN_OPTIONS[0].value);
  const [selectedRange, setSelectedRange] = useState(RANGE_OPTIONS[2].value);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        window.location.href = "/login";
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const coinDocRef = doc(db, "crypto_prices_minute", selectedCoin);
    const unsubscribe = onSnapshot(
      coinDocRef,
      (snapshot) => {
        if (!cancelled) {
          setCurrentPrice(snapshot.data()?.lastClose ?? null);
        }
      },
      (err) => console.error(err)
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, selectedCoin]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setHistory([]);

    const range = RANGE_OPTIONS.find((r) => r.value === selectedRange);
    const now = new Date();
    const start = new Date(now.getTime() - (range?.ms ?? 0));
    const startIso = start.toISOString();

    const historyRef = collection(
      doc(db, "crypto_prices_minute", selectedCoin),
      "history_minute"
    );
    const historyQuery = query(
      historyRef,
      orderBy("time", "asc"),
      where("time", ">=", startIso),
      limit(5000)
    );

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        if (cancelled) return;
        const points = snapshot.docs
          .map((docSnap) => docSnap.data())
          .filter(
            (item) =>
              typeof item?.close === "number" &&
              typeof item?.time === "string"
          )
          .map((item) => ({
            ...item,
            date: new Date(item.time),
          }));

        setHistory(points);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        if (!cancelled) {
          setError(
            err?.message ??
              "Impossibile recuperare i dati a 1 minuto per questo intervallo."
          );
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, selectedCoin, selectedRange]);

  const rangeConfig = RANGE_OPTIONS.find(
    (range) => range.value === selectedRange
  );
  const rangeMs = rangeConfig?.ms ?? 0;

  const aggregatedHistory = useMemo(
    () => aggregateForRange(history, rangeMs),
    [history, rangeMs]
  );
  const isDailyAggregation = rangeMs > DAY_MS;

  const chartData = useMemo(
    () =>
      aggregatedHistory.map((item) => ({
        time: item.date.toISOString(),
        label: isDailyAggregation
          ? item.date.toLocaleDateString()
          : item.date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
        close: item.close,
      })),
    [aggregatedHistory, isDailyAggregation]
  );

  const yDomain = useMemo(() => {
    if (aggregatedHistory.length === 0) return null;
    const values = aggregatedHistory.map((point) => point.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const padding = (max - min) * 0.05 || Math.abs(min) * 0.01 || 1;
    return [min - padding, max + padding];
  }, [aggregatedHistory]);

  const change = useMemo(() => {
    if (
      aggregatedHistory.length === 0 ||
      typeof currentPrice !== "number"
    )
      return null;
    const reference = aggregatedHistory[0]?.close;
    return calcChange(currentPrice, reference);
  }, [aggregatedHistory, currentPrice]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Market Minute Details (Test)</h1>
            <p className="text-gray-400 mt-1">
              Report sperimentale basato sui dati Yahoo Finance a 1 minuto
              memorizzati in Firestore.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <select
              className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm"
              value={selectedCoin}
              onChange={(event) => setSelectedCoin(event.target.value)}
            >
              {COIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm"
              value={selectedRange}
              onChange={(event) => setSelectedRange(event.target.value)}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm uppercase tracking-wide mb-2">
              Prezzo attuale
            </p>
            <p className="text-3xl font-bold">
              {formatCurrency(currentPrice)}
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm uppercase tracking-wide mb-2">
              Variazione ({RANGE_OPTIONS.find((r) => r.value === selectedRange)?.label})
            </p>
            {change ? (
              <div>
                <p
                  className={`text-2xl font-semibold ${
                    change.pct >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {change.pct >= 0 ? "+" : ""}
                  {change.pct.toFixed(2)}%
                </p>
                <p className="text-sm text-gray-400">
                  {change.diff >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(change.diff))}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Non ci sono abbastanza dati per questo intervallo.
              </p>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm uppercase tracking-wide mb-2">
              Dati disponibili
            </p>
            <p className="text-2xl font-semibold">
              {aggregatedHistory.length}
            </p>
            <p className="text-sm text-gray-400">
              punti nella finestra selezionata
            </p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-6 border-b border-gray-800">
            <h2 className="text-xl font-semibold">Andamento minuto per minuto</h2>
            <p className="text-sm text-gray-400">
              Report di prova: verifica che i dati importati a 1 minuto siano coerenti
              prima di unirli con il dataset principale.
            </p>
          </div>
          <div className="p-6">
            {loading ? (
              <p className="text-gray-400 text-sm">Caricamento dati...</p>
            ) : error ? (
              <p className="text-red-400 text-sm">{error}</p>
            ) : chartData.length > 0 ? (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="time"
                      stroke="#6B7280"
                      tickFormatter={(value) =>
                        isDailyAggregation
                          ? new Date(value).toLocaleDateString()
                          : new Date(value).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                      }
                    />
                    <YAxis
                      stroke="#6B7280"
                      tickFormatter={(value) =>
                        value.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 4,
                        })
                      }
                      domain={yDomain ?? ["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "none",
                        borderRadius: "0.75rem",
                      }}
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(label) =>
                        new Date(label).toLocaleString()
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      stroke="#f472b6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                Nessun dato disponibile per questo intervallo temporale.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

