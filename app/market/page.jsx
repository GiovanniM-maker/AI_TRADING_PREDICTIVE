"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
} from "recharts";

const COINS = [
  { id: "BTCUSDT", label: "BTC" },
  { id: "ETHUSDT", label: "ETH" },
  { id: "SOLUSDT", label: "SOL" },
  { id: "BNBUSDT", label: "BNB" },
  { id: "DOGEUSDT", label: "DOGE" },
  { id: "XRPUSDT", label: "XRP" },
];

export default function MarketPage() {
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState({});
  const [loading, setLoading] = useState(true);

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

    const unsubscribers = [];

    COINS.forEach((coin) => {
      const coinDocRef = doc(db, "crypto_prices", coin.id);
      const historyRef = collection(coinDocRef, "history_yahoo");
      const historyQuery = query(
        historyRef,
        orderBy("time", "desc"),
        limit(10)
      );

      const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
        const historyData = snapshot.docs
          .map((docSnap) => docSnap.data())
          .filter(
            (item) =>
              typeof item?.close === "number" &&
              typeof item?.time === "string"
          )
          .map((item) => ({
            ...item,
            time: item.time,
          }));

        historyData.reverse(); // ensure ascending order for chart

        setCoins((prev) => ({
          ...prev,
          [coin.id]: {
            ...prev[coin.id],
            history: historyData,
          },
        }));
        setLoading(false);
      });

      const unsubscribeCoin = onSnapshot(coinDocRef, (docSnapshot) => {
        const data = docSnapshot.data();
        setCoins((prev) => ({
          ...prev,
          [coin.id]: {
            ...prev[coin.id],
            price: data?.lastYahooClose || null,
          },
        }));
        setLoading(false);
      });

      unsubscribers.push(unsubscribeHistory, unsubscribeCoin);
    });

    const interval = setInterval(() => {
      COINS.forEach(async (coin) => {
        const historyQuery = query(
          collection(doc(db, "crypto_prices", coin.id), "history_yahoo"),
          orderBy("time", "desc"),
          limit(10)
        );
        const snapshot = await getDocs(historyQuery);
        const historyData = snapshot.docs
          .map((docSnap) => docSnap.data())
          .filter(
            (item) =>
              typeof item?.close === "number" &&
              typeof item?.time === "string"
          )
          .map((item) => ({
            ...item,
            time: item.time,
          }));

        historyData.reverse();

        setCoins((prev) => ({
          ...prev,
          [coin.id]: {
            ...prev[coin.id],
            history: historyData,
          },
        }));
      });
    }, 15000);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      clearInterval(interval);
    };
  }, [user]);

  const getVariation = (history) => {
    if (!history || history.length < 2) return null;
    const latest = history[history.length - 1]?.close;
    const previous = history[history.length - 2]?.close;
    if (
      typeof latest !== "number" ||
      typeof previous !== "number" ||
      previous === 0
    ) {
      return null;
    }
    return ((latest - previous) / previous) * 100;
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Market Overview</h1>
        {loading ? (
          <p>Loading data...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COINS.map((coin) => {
              const data = coins[coin.id];
              const history = data?.history || [];
              const price = data?.price || null;
              const variation = getVariation(history);
              const chartData = history.map((point) => ({
                ...point,
                label: new Date(point.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }));

              return (
                <div
                  key={coin.id}
                  className="bg-gray-900 p-4 rounded-lg shadow-md border border-gray-800"
                >
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-semibold">{coin.label}</h2>
                    {variation !== null && (
                      <span
                        className={`text-sm font-semibold ${
                          variation >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {variation >= 0 ? "+" : ""}
                        {variation.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold mb-4">
                    {typeof price === "number"
                      ? `$${price.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}`
                      : "No market data"}
                  </p>
                  {history.length > 0 ? (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1f2937",
                              border: "none",
                              borderRadius: "0.5rem",
                            }}
                            labelFormatter={(_, index) =>
                              chartData[index]?.label ?? ""
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="close"
                            stroke="#34d399"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">
                      No market data available.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

