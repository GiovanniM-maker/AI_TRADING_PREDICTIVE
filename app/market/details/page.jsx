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
  { value: "1h", label: "Ultima ora", ms: 1 * 60 * 60 * 1000 },
  { value: "3h", label: "Ultime 3 ore", ms: 3 * 60 * 60 * 1000 },
  { value: "6h", label: "Ultime 6 ore", ms: 6 * 60 * 60 * 1000 },
  { value: "12h", label: "Ultime 12 ore", ms: 12 * 60 * 60 * 1000 },
  { value: "24h", label: "Ultime 24 ore", ms: 24 * 60 * 60 * 1000 },
  { value: "3d", label: "Ultimi 3 giorni", ms: 3 * 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Ultimi 7 giorni", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "1m", label: "Ultimo mese", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "3m", label: "Ultimi 3 mesi", ms: 90 * 24 * 60 * 60 * 1000 },
  { value: "6m", label: "Ultimi 6 mesi", ms: 180 * 24 * 60 * 60 * 1000 },
  { value: "1y", label: "Ultimo anno", ms: 365 * 24 * 60 * 60 * 1000 },
  { value: "3y", label: "Ultimi 3 anni", ms: 3 * 365 * 24 * 60 * 60 * 1000 },
  { value: "5y", label: "Ultimi 5 anni", ms: 5 * 365 * 24 * 60 * 60 * 1000 },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * DAY_MS;
const SIX_MONTHS_MS = 180 * DAY_MS;

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
  const groupByDay = rangeMs > SIX_MONTHS_MS;
  const groupByHour = rangeMs > THREE_MONTHS_MS && rangeMs <= SIX_MONTHS_MS;
  const map = new Map();

  points.forEach((point) => {
    const date = point?.date instanceof Date ? point.date : null;
    if (!date) return;
    const iso = date.toISOString();
    const key = groupByDay
      ? iso.slice(0, 10) // YYYY-MM-DD
      : groupByHour
      ? iso.slice(0, 13) // YYYY-MM-DDTHH
      : iso; // minute precision
    const existing = map.get(key);
    if (!existing || date.getTime() > existing.date.getTime()) {
      map.set(key, point);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

export default function MarketDetailsPage() {
  const [user, setUser] = useState(null);
  const [selectedCoin, setSelectedCoin] = useState(COIN_OPTIONS[0].value);
  const [selectedRange, setSelectedRange] = useState(RANGE_OPTIONS[4].value); // default 24h
  const [currentPrice, setCurrentPrice] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        window.location.href = "/login";
      } else {
        setUser(currentUser);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const coinDocRef = doc(db, "crypto_prices", selectedCoin);
    const unsubscribe = onSnapshot(
      coinDocRef,
      (snapshot) => {
        if (!cancelled) {
          setCurrentPrice(snapshot.data()?.lastYahooClose ?? null);
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

    setHistory([]);
    setLoading(true);
    setError(null);

    const range = RANGE_OPTIONS.find((r) => r.value === selectedRange);
    const now = new Date();
    const start = new Date(now.getTime() - (range?.ms ?? 0));
    const startIso = start.toISOString();

    const historyRef = collection(
      doc(db, "crypto_prices", selectedCoin),
      "history_yahoo"
    );
    const historyQuery = query(
      historyRef,
      orderBy("time", "asc"),
      where("time", ">=", startIso),
      limit(2000)
    );

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        if (cancelled) return;
        const recordsMap = new Map();
        snapshot
          .docs
          .forEach((docSnap) => {
            const data = docSnap.data();
            if (
              typeof data?.close === "number" &&
              typeof data?.time === "string"
            ) {
              recordsMap.set(data.time, {
                ...data,
                date: new Date(data.time),
              });
            }
          });
        const sorted = Array.from(recordsMap.values()).sort(
          (a, b) => a.date.getTime() - b.date.getTime()
        );
        setHistory(sorted);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        if (!cancelled) {
          setError(
            err?.message ??
              "Impossibile recuperare i dati di mercato per questo intervallo."
          );
          setHistory([]);
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
  const isDailyAggregation = rangeMs > SIX_MONTHS_MS;
  const isHourlyAggregation =
    rangeMs > THREE_MONTHS_MS && rangeMs <= SIX_MONTHS_MS;

  const chartData = useMemo(
    () =>
      aggregatedHistory.map((item) => ({
        time: item.date.toISOString(),
        label: isDailyAggregation
          ? item.date.toLocaleDateString()
          : isHourlyAggregation
          ? item.date.toLocaleString([], {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
            })
          : item.date.toLocaleString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
        close: item.close,
      })),
    [aggregatedHistory, isDailyAggregation, isHourlyAggregation]
  );

  const yDomain = useMemo(() => {
    if (aggregatedHistory.length === 0) return null;
    const values = aggregatedHistory
      .map((point) => point.close)
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min === max) {
      const offset = Math.max(Math.abs(min) * 0.01, 1);
      return [min - offset, max + offset];
    }
    return [min, max];
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
            <h1 className="text-3xl font-bold">Market Details</h1>
            <p className="text-gray-400 mt-1">
              Analizza i prezzi memorizzati in Firestore per ogni criptovaluta.
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
            <h2 className="text-xl font-semibold">Andamento storico</h2>
            <p className="text-sm text-gray-400">
              Ultimi valori registrati nella finestra temporale selezionata.
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
                      tickFormatter={(value) =>
                        isDailyAggregation
                          ? new Date(value).toLocaleDateString()
                          : isHourlyAggregation
                          ? new Date(value).toLocaleString([], {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                            })
                          : new Date(value).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                      }
                      stroke="#6B7280"
                    />
                    <YAxis
                      stroke="#6B7280"
                      tickFormatter={(value) =>
                        value.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
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
                      stroke="#38bdf8"
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

