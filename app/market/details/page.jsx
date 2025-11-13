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
import { monitoredGetDocs } from "@/lib/firestore_monitored";
import { monitor } from "@/lib/monitor";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import CryptoSentimentPanel from "@/components/CryptoSentimentPanel";

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

function getBucketType(rangeValue) {
  switch (rangeValue) {
    case "1h":
    case "3h":
    case "6h":
    case "12h":
    case "24h":
      return "minute";
    case "3d":
    case "7d":
    case "1m":
      return "hour";
    default:
      return "day";
  }
}

function getDocInterval(rangeValue) {
  switch (rangeValue) {
    case "1h":
    case "3h":
    case "6h":
    case "12h":
    case "24h":
      return 60 * 1000;
    case "3d":
    case "7d":
    case "1m":
      return 60 * 60 * 1000;
    default:
      return DAY_MS;
  }
}

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

function truncateDate(date, bucketType) {
  const bucketDate = new Date(date);
  switch (bucketType) {
    case "day":
      bucketDate.setUTCHours(0, 0, 0, 0);
      break;
    case "hour":
      bucketDate.setUTCMinutes(0, 0, 0);
      break;
    case "minute":
      bucketDate.setUTCSeconds(0, 0);
      break;
    case "tenSeconds":
      const seconds = bucketDate.getUTCSeconds();
      const floored = Math.floor(seconds / 10) * 10;
      bucketDate.setUTCSeconds(floored, 0);
      break;
  }
  return bucketDate;
}

function aggregateForRange(points, bucketType) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const map = new Map();

  points.forEach((point) => {
    const date = point?.date instanceof Date ? point.date : null;
    if (!date) return;
    const bucketDate = truncateDate(date, bucketType);
    const key = bucketDate.toISOString();
    const existing = map.get(key);
    if (!existing || date.getTime() > existing.originalDate.getTime()) {
      map.set(key, {
        ...point,
        date: bucketDate,
        originalDate: date,
      });
    }
  });

  return Array.from(map.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(({ originalDate, ...rest }) => rest);
}

export default function MarketDetailsPage() {
  const [user, setUser] = useState(null);
  const [selectedCoin, setSelectedCoin] = useState(COIN_OPTIONS[0].value);
  const [selectedRange, setSelectedRange] = useState(RANGE_OPTIONS[4].value); // default 24h
  const [currentPrice, setCurrentPrice] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [layerState, setLayerState] = useState({
    pivot: false,
    ema20: false,
    ema200: false,
    rsi: false,
    macd: false,
    distEma20: false,
    distEma200: false,
    atr14: false,
  });
  const [pivotLevels, setPivotLevels] = useState(null);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [pivotError, setPivotError] = useState(null);
  const [indicatorData, setIndicatorData] = useState([]);
  const [indicatorLoading, setIndicatorLoading] = useState(false);
  const [indicatorError, setIndicatorError] = useState(null);

  const rangeConfig = RANGE_OPTIONS.find(
    (range) => range.value === selectedRange
  );
  const bucketType = getBucketType(rangeConfig?.value);
  const supportsIndicatorRange = bucketType === "minute";
  const indicatorEnabled =
    layerState.ema20 ||
    layerState.ema200 ||
    layerState.rsi ||
    layerState.macd ||
    layerState.distEma20 ||
    layerState.distEma200 ||
    layerState.atr14;

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
    if (!supportsIndicatorRange && indicatorEnabled) {
      setLayerState((prev) => ({
        ...prev,
        ema20: false,
        ema200: false,
        rsi: false,
        macd: false,
        distEma20: false,
        distEma200: false,
        atr14: false,
      }));
    }
  }, [supportsIndicatorRange, indicatorEnabled]);

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
    let pollingIntervalId = null;
    let fullRefreshIntervalId = null;
    let isFetching = false;
    let lastHiddenTime = null;
    let lastFullFetchTime = Date.now();

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

    // Helper: process documents into records map
    const processDocs = (docs) => {
      const recordsMap = new Map();
      docs.forEach((docSnap) => {
        const data = docSnap.data();
        const price =
          typeof data?.close === "number"
            ? data.close
            : typeof data?.close_usd === "number"
            ? data.close_usd
            : null;
        const iso =
          typeof data?.time === "string"
            ? data.time
            : data?.time?.toDate?.()?.toISOString?.() ?? null;
        if (price === null || !iso) return;
        const pointDate = new Date(iso);
        recordsMap.set(iso, {
          close: price,
          time: iso,
          date: truncateDate(pointDate, getBucketType(selectedRange)),
          originalDate: pointDate,
        });
      });
      return recordsMap;
    };

    // Helper: merge and sort records
    const mergeAndSort = (existingMap, newMap) => {
      const merged = new Map(existingMap);
      newMap.forEach((value, key) => merged.set(key, value));
      return Array.from(merged.values())
        .sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime())
        .map(({ originalDate, ...rest }) => rest);
    };

    // FULL FETCH: limit 500 (for mount, range change, coin change, visibility after +1min, hourly)
    const fetchHistoryFull = async () => {
      if (isFetching || cancelled) return;
      if (document.visibilityState === "hidden") return;

      isFetching = true;
      try {
        const fullQuery = query(
          historyRef,
          where("time", ">=", startIso),
          orderBy("time", "asc"),
          limit(500)
        );
        const snapshot = await monitoredGetDocs(fullQuery);
        if (cancelled) return;

        const recordsMap = processDocs(snapshot.docs);
        const ordered = Array.from(recordsMap.values())
          .sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime())
          .map(({ originalDate, ...rest }) => rest);

        if (!cancelled) {
          setHistory([...ordered]);
          setLoading(false);
          lastFullFetchTime = Date.now();
          
          // Track metrics
          monitor.fullFetchCount++;
          monitor.lastFullFetchTimestamp = Date.now();
          monitor.pollingEvents++;
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            err?.message ??
              "Impossibile recuperare i dati di mercato per questo intervallo."
          );
          setHistory([]);
          setLoading(false);
        }
      } finally {
        isFetching = false;
      }
    };

    // INCREMENTAL FETCH: limit 5 (for polling every 4s)
    const fetchHistoryIncremental = async () => {
      if (isFetching || cancelled) return;
      if (document.visibilityState === "hidden") return;

      isFetching = true;
      try {
        const incrementalQuery = query(
          historyRef,
          where("time", ">=", startIso),
          orderBy("time", "desc"),
          limit(5)
        );
        const snapshot = await monitoredGetDocs(incrementalQuery);
        if (cancelled) return;

        const newRecordsMap = processDocs(snapshot.docs);
        if (newRecordsMap.size === 0) {
          isFetching = false;
          return;
        }

        // Merge with existing history
        setHistory((prevHistory) => {
          const existingMap = new Map();
          prevHistory.forEach((item) => {
            existingMap.set(item.time, item);
          });
          return mergeAndSort(existingMap, newRecordsMap);
        });

        // Track metrics
        monitor.incrementalFetchCount++;
        monitor.lastIncrementalTimestamp = Date.now();
        monitor.pollingEvents++;
      } catch (err) {
        console.error(err);
      } finally {
        isFetching = false;
      }
    };

    // Initial FULL fetch on mount
    fetchHistoryFull();

    // Polling every 4s: INCREMENTAL fetch (only 5 docs)
    pollingIntervalId = setInterval(() => {
      fetchHistoryIncremental();
    }, 4000);

    // Full refresh every hour (3600s)
    fullRefreshIntervalId = setInterval(() => {
      fetchHistoryFull();
    }, 3600000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (cancelled) return;

      if (document.visibilityState === "hidden") {
        lastHiddenTime = Date.now();
      } else if (document.visibilityState === "visible") {
        // Full fetch if tab was hidden for more than 1 minute
        if (lastHiddenTime && Date.now() - lastHiddenTime > 60000) {
          if (!isFetching) {
            fetchHistoryFull();
          }
        }
        lastHiddenTime = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
      if (fullRefreshIntervalId) {
        clearInterval(fullRefreshIntervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, selectedCoin, selectedRange]);

  const aggregatedHistory = useMemo(
    () => aggregateForRange(history, bucketType),
    [history, bucketType]
  );
  const isDailyAggregation = bucketType === "day";
  const isHourlyAggregation = bucketType === "hour";
  const isMinuteAggregation = bucketType === "minute";

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
          : isMinuteAggregation
          ? item.date.toLocaleString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : item.date.toLocaleString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
        close: item.close,
      })),
    [aggregatedHistory, isDailyAggregation, isHourlyAggregation, isMinuteAggregation]
  );

  const change = useMemo(() => {
    if (
      aggregatedHistory.length === 0 ||
      typeof currentPrice !== "number"
    )
      return null;
    const reference = aggregatedHistory[0]?.close;
    return calcChange(currentPrice, reference);
  }, [aggregatedHistory, currentPrice]);

  const toggleLayer = (key) => {
    setLayerState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    if (!user || !layerState.pivot) {
      setPivotLevels(null);
      setPivotError(null);
      setPivotLoading(false);
      return;
    }
    let cancelled = false;
    const fetchPivot = async () => {
      try {
        setPivotLoading(true);
        setPivotError(null);
        const pivotsRef = collection(
          db,
          "crypto_prices",
          selectedCoin,
          "pivot_points"
        );
        const snapshot = await monitoredGetDocs(
          query(pivotsRef, orderBy("date", "desc"), limit(1))
        );
        if (!snapshot.empty) {
          const data = snapshot.docs[0]?.data();
          if (!cancelled) {
            setPivotLevels(data ?? null);
          }
        } else if (!cancelled) {
          setPivotLevels(null);
          setPivotError("Nessun pivot disponibile");
        }
      } catch (err) {
        if (!cancelled) {
          setPivotError(
            err?.message ?? "Impossibile recuperare i pivot point attuali."
          );
          setPivotLevels(null);
        }
      } finally {
        if (!cancelled) {
          setPivotLoading(false);
        }
      }
    };

    fetchPivot();

    return () => {
      cancelled = true;
    };
  }, [user, layerState.pivot, selectedCoin]);

  useEffect(() => {
    if (!user || !indicatorEnabled || !supportsIndicatorRange) {
      setIndicatorData([]);
      setIndicatorError(null);
      setIndicatorLoading(false);
      return;
    }

    let cancelled = false;
    let pollingIntervalId = null;
    let fullRefreshIntervalId = null;
    let isFetching = false;
    let lastHiddenTime = null;
    let lastFullFetchTime = Date.now();

    setIndicatorLoading(true);
    setIndicatorError(null);

    const range = RANGE_OPTIONS.find((r) => r.value === selectedRange);
    const now = new Date();
    const start = new Date(now.getTime() - (range?.ms ?? 0));
    const startIso = start.toISOString();

    const indicatorsRef = collection(
      doc(db, "crypto_prices", selectedCoin),
      "indicatori"
    );

    // Helper: process documents into rows
    const processDocs = (docs) => {
      return docs
        .map((docSnap) => docSnap.data())
        .map((item) => {
          const iso =
            typeof item?.time === "string"
              ? item.time
              : item?.time?.toDate?.()?.toISOString?.() ?? null;
          if (!iso) return null;
          const date = new Date(iso);
          return {
            ...item,
            time: iso,
            date,
          };
        })
        .filter((item) => item !== null);
    };

    // Helper: merge and sort indicators
    const mergeAndSort = (existingRows, newRows) => {
      const mergedMap = new Map();
      existingRows.forEach((item) => {
        mergedMap.set(item.time, item);
      });
      newRows.forEach((item) => {
        mergedMap.set(item.time, item);
      });
      return Array.from(mergedMap.values()).sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      );
    };

    // FULL FETCH: limit 500 (for mount, range change, coin change, visibility after +1min, hourly)
    const fetchIndicatorsFull = async () => {
      if (isFetching || cancelled) return;
      if (document.visibilityState === "hidden") return;

      isFetching = true;
      try {
        const fullQuery = query(
          indicatorsRef,
          where("time", ">=", startIso),
          orderBy("time", "asc"),
          limit(500)
        );
        const snapshot = await monitoredGetDocs(fullQuery);
        if (cancelled) return;

        const rows = processDocs(snapshot.docs).sort(
          (a, b) => a.date.getTime() - b.date.getTime()
        );

        if (!cancelled) {
          setIndicatorData(rows);
          setIndicatorLoading(false);
          lastFullFetchTime = Date.now();
          
          // Track metrics
          monitor.fullFetchCount++;
          monitor.lastFullFetchTimestamp = Date.now();
          monitor.pollingEvents++;
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setIndicatorError(
            err?.message ?? "Impossibile recuperare gli indicatori tecnici."
          );
          setIndicatorData([]);
          setIndicatorLoading(false);
        }
      } finally {
        isFetching = false;
      }
    };

    // INCREMENTAL FETCH: limit 5 (for polling every 4s)
    const fetchIndicatorsIncremental = async () => {
      if (isFetching || cancelled) return;
      if (document.visibilityState === "hidden") return;

      isFetching = true;
      try {
        const incrementalQuery = query(
          indicatorsRef,
          where("time", ">=", startIso),
          orderBy("time", "desc"),
          limit(5)
        );
        const snapshot = await monitoredGetDocs(incrementalQuery);
        if (cancelled) return;

        const newRows = processDocs(snapshot.docs);
        if (newRows.length === 0) {
          isFetching = false;
          return;
        }

        // Merge with existing indicator data
        setIndicatorData((prevData) => {
          return mergeAndSort(prevData, newRows);
        });

        // Track metrics
        monitor.incrementalFetchCount++;
        monitor.lastIncrementalTimestamp = Date.now();
        monitor.pollingEvents++;
      } catch (err) {
        console.error(err);
      } finally {
        isFetching = false;
      }
    };

    // Initial FULL fetch on mount
    fetchIndicatorsFull();

    // Polling every 4s: INCREMENTAL fetch (only 5 docs)
    pollingIntervalId = setInterval(() => {
      fetchIndicatorsIncremental();
    }, 4000);

    // Full refresh every hour (3600s)
    fullRefreshIntervalId = setInterval(() => {
      fetchIndicatorsFull();
    }, 3600000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (cancelled) return;

      if (document.visibilityState === "hidden") {
        lastHiddenTime = Date.now();
      } else if (document.visibilityState === "visible") {
        // Full fetch if tab was hidden for more than 1 minute
        if (lastHiddenTime && Date.now() - lastHiddenTime > 60000) {
          if (!isFetching) {
            fetchIndicatorsFull();
          }
        }
        lastHiddenTime = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
      if (fullRefreshIntervalId) {
        clearInterval(fullRefreshIntervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    user,
    selectedCoin,
    selectedRange,
    indicatorEnabled,
    supportsIndicatorRange,
  ]);

  const indicatorByTime = useMemo(() => {
    const map = new Map();
    indicatorData.forEach((item) => {
      const iso = item?.time
        ? new Date(item.time).toISOString()
        : item?.date?.toISOString?.();
      if (!iso) return;
      map.set(iso, item);
    });
    return map;
  }, [indicatorData]);

  const chartDataWithIndicators = useMemo(
    () =>
      chartData.map((point) => {
        const indicator = indicatorByTime.get(point.time);
        return {
          ...point,
          ema20:
            indicator && typeof indicator.ema20 === "number"
              ? indicator.ema20
              : null,
          ema200:
            indicator && typeof indicator.ema200 === "number"
              ? indicator.ema200
              : null,
          dist_ema20:
            indicator && typeof indicator.dist_ema20 === "number"
              ? indicator.dist_ema20
              : null,
          dist_ema200:
            indicator && typeof indicator.dist_ema200 === "number"
              ? indicator.dist_ema200
              : null,
        };
      }),
    [chartData, indicatorByTime]
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

  const rsiChartData = useMemo(
    () =>
      indicatorData.map((item) => ({
        time: new Date(item.time).toISOString(),
        rsi14:
          typeof item?.rsi14 === "number" && Number.isFinite(item.rsi14)
            ? item.rsi14
            : null,
      })),
    [indicatorData]
  );

  const macdChartData = useMemo(
    () =>
      indicatorData.map((item) => ({
        time: new Date(item.time).toISOString(),
        macd:
          typeof item?.macd === "number" && Number.isFinite(item.macd)
            ? item.macd
            : null,
        signal:
          typeof item?.signal === "number" && Number.isFinite(item.signal)
            ? item.signal
            : null,
      })),
    [indicatorData]
  );

  const atrChartData = useMemo(
    () =>
      indicatorData.map((item) => ({
        time: new Date(item.time).toISOString(),
        atr14:
          typeof item?.atr14 === "number" && Number.isFinite(item.atr14)
            ? item.atr14
            : null,
      })),
    [indicatorData]
  );

  const distChartData = useMemo(
    () =>
      indicatorData.map((item) => ({
        time: new Date(item.time).toISOString(),
        dist_ema20:
          typeof item?.dist_ema20 === "number" && Number.isFinite(item.dist_ema20)
            ? item.dist_ema20
            : null,
        dist_ema200:
          typeof item?.dist_ema200 === "number" &&
          Number.isFinite(item.dist_ema200)
            ? item.dist_ema200
            : null,
      })),
    [indicatorData]
  );

  const distDomain = useMemo(() => {
    if (!layerState.distEma20 && !layerState.distEma200) return [-1, 1];
    const values = [];
    distChartData.forEach((point) => {
      if (layerState.distEma20 && Number.isFinite(point.dist_ema20)) {
        values.push(Math.abs(point.dist_ema20));
      }
      if (layerState.distEma200 && Number.isFinite(point.dist_ema200)) {
        values.push(Math.abs(point.dist_ema200));
      }
    });
    if (values.length === 0) return [-1, 1];
    const maxAbs = Math.max(...values);
    if (!Number.isFinite(maxAbs) || maxAbs === 0) return [-1, 1];
    const padding = maxAbs * 0.1;
    const upper = maxAbs + padding;
    return [-upper, upper];
  }, [distChartData, layerState.distEma20, layerState.distEma200]);

  const hasDistValues = useMemo(
    () =>
      distChartData.some(
        (point) =>
          (layerState.distEma20 && Number.isFinite(point.dist_ema20)) ||
          (layerState.distEma200 && Number.isFinite(point.dist_ema200))
      ),
    [distChartData, layerState.distEma20, layerState.distEma200]
  );

  const hasAtrValues = useMemo(
    () =>
      atrChartData.some(
        (point) => layerState.atr14 && Number.isFinite(point.atr14)
      ),
    [atrChartData, layerState.atr14]
  );

  const showDistPanel =
    supportsIndicatorRange && (layerState.distEma20 || layerState.distEma200);
  const showAtrPanel = supportsIndicatorRange && layerState.atr14;

  const pivotLines = useMemo(() => {
    if (!pivotLevels) return [];
    const entries = [
      { key: "r2", label: "R2", value: pivotLevels?.r2, color: "#fca5a5" },
      { key: "r1", label: "R1", value: pivotLevels?.r1, color: "#f87171" },
      {
        key: "pivot",
        label: "Pivot",
        value: pivotLevels?.pivot,
        color: "#facc15",
      },
      { key: "s1", label: "S1", value: pivotLevels?.s1, color: "#4ade80" },
      { key: "s2", label: "S2", value: pivotLevels?.s2, color: "#bbf7d0" },
    ];
    return entries.filter(
      (entry) => typeof entry.value === "number" && Number.isFinite(entry.value)
    );
  }, [pivotLevels]);

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
          <div className="flex flex-col gap-3 sm:items-end">
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
            <div className="flex flex-wrap gap-2 justify-end">
              {[
                { key: "ema20", label: "EMA 20", requiresMinute: true },
                { key: "ema200", label: "EMA 200", requiresMinute: true },
                { key: "distEma20", label: "DIST EMA 20", requiresMinute: true },
                { key: "distEma200", label: "DIST EMA 200", requiresMinute: true },
                { key: "atr14", label: "ATR 14", requiresMinute: true },
                { key: "rsi", label: "RSI 14", requiresMinute: true },
                { key: "macd", label: "MACD", requiresMinute: true },
                { key: "pivot", label: "Pivot Points", requiresMinute: false },
              ].map((option) => {
                const disabled =
                  option.requiresMinute && !supportsIndicatorRange;
                const active = layerState[option.key];
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => !disabled && toggleLayer(option.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs uppercase tracking-wide transition-colors ${
                      active
                        ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
                        : "border-gray-700 bg-gray-900 text-gray-300"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    title={
                      disabled
                        ? "Indicatori disponibili solo per intervalli fino a 24 ore"
                        : undefined
                    }
                  >
                    <span>{option.label}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        active ? "bg-cyan-400/20" : "bg-gray-800"
                      }`}
                    >
                      {active ? "ON" : "OFF"}
                    </span>
                  </button>
                );
              })}
            </div>
            {!supportsIndicatorRange && (
              <p className="text-xs text-gray-500 text-right">
                EMA, DIST EMA, ATR, RSI e MACD sono disponibili per intervalli fino a
                24 ore.
              </p>
            )}
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-stretch">
          <div className="bg-gray-900 border border-gray-800 rounded-xl h-full flex flex-col">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-xl font-semibold">Andamento storico</h2>
              <p className="text-sm text-gray-400">
                Ultimi valori registrati nella finestra temporale selezionata.
              </p>
              {pivotError && layerState.pivot && (
                <p className="text-xs text-yellow-400 mt-2">{pivotError}</p>
              )}
              {indicatorError && indicatorEnabled && supportsIndicatorRange && (
                <p className="text-xs text-red-400 mt-2">{indicatorError}</p>
              )}
              {indicatorLoading && indicatorEnabled && supportsIndicatorRange && (
                <p className="text-xs text-gray-400 mt-2">
                  Caricamento indicatori tecnici…
                </p>
              )}
            </div>
            <div className="p-6 flex-1">
              {loading ? (
                <p className="text-gray-400 text-sm">Caricamento dati...</p>
              ) : error ? (
                <p className="text-red-400 text-sm">{error}</p>
              ) : chartDataWithIndicators.length > 0 ? (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartDataWithIndicators}
                      key={
                        chartDataWithIndicators[chartDataWithIndicators.length - 1]
                          ?.time ||
                        `chart-${selectedCoin}-${selectedRange}`
                      }
                    >
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
                            : isMinuteAggregation
                            ? new Date(value).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
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
                      {layerState.ema20 && supportsIndicatorRange && (
                        <Line
                          type="monotone"
                          dataKey="ema20"
                          stroke="#22d3ee"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {layerState.ema200 && supportsIndicatorRange && (
                        <Line
                          type="monotone"
                          dataKey="ema200"
                          stroke="#a855f7"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {layerState.pivot &&
                        !pivotLoading &&
                        pivotLines.map((line) => (
                          <ReferenceLine
                            key={line.key}
                            y={line.value}
                            stroke={line.color}
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            label={{
                              value: `${line.label} — ${formatCurrency(line.value)}`,
                              position: "right",
                              fill: line.color,
                              fontSize: 12,
                            }}
                          />
                        ))}
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

          <CryptoSentimentPanel symbol={selectedCoin} />
        </div>

        {supportsIndicatorRange && indicatorEnabled && (
          <div className="mt-6 space-y-6">
            {showAtrPanel && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-lg font-semibold">ATR 14</h3>
                </div>
                <div className="p-4">
                  {indicatorLoading ? (
                    <p className="text-gray-400 text-sm">Caricamento ATR...</p>
                  ) : hasAtrValues ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={atrChartData}>
                          <XAxis
                            dataKey="time"
                            stroke="#6B7280"
                            tickFormatter={(value) =>
                              new Date(value).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            }
                          />
                          <YAxis stroke="#6B7280" domain={["auto", "auto"]} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#111827",
                              border: "none",
                              borderRadius: "0.75rem",
                            }}
                            formatter={(value) =>
                              typeof value === "number"
                                ? value.toFixed(value < 1 ? 4 : 2)
                                : value
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="atr14"
                            stroke="#FF9800"
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">
                      Nessun dato ATR disponibile per questo intervallo.
                    </p>
                  )}
                </div>
              </div>
            )}

            {showDistPanel && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-lg font-semibold">
                    Distanza dalle EMA
                  </h3>
                </div>
                <div className="p-4">
                  {indicatorLoading ? (
                    <p className="text-gray-400 text-sm">
                      Caricamento distanza EMA...
                    </p>
                  ) : hasDistValues ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={distChartData}>
                          <XAxis
                            dataKey="time"
                            stroke="#6B7280"
                            tickFormatter={(value) =>
                              new Date(value).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            }
                          />
                          <YAxis
                            stroke="#6B7280"
                            domain={distDomain}
                            tickFormatter={(value) =>
                              Number.isFinite(value)
                                ? value.toFixed(Math.abs(value) < 1 ? 3 : 2)
                                : ""
                            }
                          />
                          <ReferenceLine
                            y={0}
                            stroke="#6B7280"
                            strokeDasharray="4 4"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#111827",
                              border: "none",
                              borderRadius: "0.75rem",
                            }}
                          />
                          {layerState.distEma20 && (
                            <Line
                              type="monotone"
                              dataKey="dist_ema20"
                              stroke="#29B6F6"
                              strokeWidth={1.5}
                              dot={false}
                              connectNulls
                            />
                          )}
                          {layerState.distEma200 && (
                            <Line
                              type="monotone"
                              dataKey="dist_ema200"
                              stroke="#AB47BC"
                              strokeWidth={1.5}
                              dot={false}
                              connectNulls
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">
                      Nessun dato di distanza EMA disponibile per questo
                      intervallo.
                    </p>
                  )}
                </div>
              </div>
            )}

            {layerState.rsi && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">RSI 14</h3>
                  <span className="text-xs text-gray-400">0 – 100</span>
                </div>
                <div className="p-4">
                  {indicatorLoading ? (
                    <p className="text-gray-400 text-sm">
                      Caricamento RSI...
                    </p>
                  ) : rsiChartData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rsiChartData}>
                          <XAxis
                            dataKey="time"
                            stroke="#6B7280"
                            tickFormatter={(value) =>
                              new Date(value).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            }
                          />
                          <YAxis domain={[0, 100]} stroke="#6B7280" />
                          <ReferenceLine y={70} stroke="#f87171" strokeDasharray="3 3" />
                          <ReferenceLine y={30} stroke="#34d399" strokeDasharray="3 3" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#111827",
                              border: "none",
                              borderRadius: "0.75rem",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="rsi14"
                            stroke="#fde047"
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">
                      Nessun dato RSI disponibile per questo intervallo.
                    </p>
                  )}
                </div>
              </div>
            )}

            {layerState.macd && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-lg font-semibold">MACD</h3>
                </div>
                <div className="p-4">
                  {indicatorLoading ? (
                    <p className="text-gray-400 text-sm">
                      Caricamento MACD...
                    </p>
                  ) : macdChartData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={macdChartData}>
                          <XAxis
                            dataKey="time"
                            stroke="#6B7280"
                            tickFormatter={(value) =>
                              new Date(value).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            }
                          />
                          <YAxis stroke="#6B7280" domain={["auto", "auto"]} />
                          <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="2 2" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#111827",
                              border: "none",
                              borderRadius: "0.75rem",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="macd"
                            stroke="#60a5fa"
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="signal"
                            stroke="#fb7185"
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">
                      Nessun dato MACD disponibile per questo intervallo.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

