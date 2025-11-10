"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const COIN_ORDER = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "dogecoin",
  "ripple",
];

function formatTime(d) {
  const dt = new Date(d);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState([]);
  const [coins, setCoins] = useState([]);
  const [status, setStatus] = useState("ready");
  const [activeCoin, setActiveCoin] = useState("bitcoin");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) window.location.href = "/login";
      else setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const qRef = collection(db, "coins");
    const unsub = onSnapshot(qRef, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort(
        (a, b) => COIN_ORDER.indexOf(a.id) - COIN_ORDER.indexOf(b.id)
      );
      setCoins(arr);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const qRef = query(
      collection(db, "coins", activeCoin, "prices"),
      orderBy("ts", "asc"),
      limit(200)
    );
    const unsub = onSnapshot(qRef, (snap) => {
      const arr = snap.docs.map((d) => {
        const v = d.data();
        const tsValue =
          typeof v.ts?.toDate === "function" ? v.ts.toDate() : new Date(v.ts);
        return { ts: tsValue, price: v.price };
      });
      setData(arr);
    });
    return () => unsub();
  }, [user, activeCoin]);

  useEffect(() => {
    if (!user) return;
    let timer = null;
    const hit = async () => {
      try {
        setStatus("updating...");
        await fetch("/api/ingest", { method: "GET", cache: "no-store" });
      } catch (e) {
        console.error(e);
      } finally {
        setStatus("live");
      }
    };
    hit();
    timer = setInterval(hit, 15000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [user]);

  const chartData = useMemo(
    () =>
      data.map((p) => ({
        name: formatTime(p.ts),
        value: p.price,
      })),
    [data]
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => signOut(auth)}
            className="text-sm text-gray-400 hover:text-white"
          >
            Logout
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-6 mb-8 border-b border-gray-800 pb-6">
          {coins.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveCoin(c.id)}
              className={`text-center min-w-[120px] cursor-pointer transition ${
                activeCoin === c.id ? "scale-110 text-yellow-400" : "text-white"
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <img src={c.image} alt={c.symbol} className="w-5 h-5" />
                <span className="font-bold">{c.symbol}</span>
              </div>
              <div className="text-lg font-semibold">
                $
                {typeof c.lastPrice === "number"
                  ? c.lastPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })
                  : "—"}
              </div>
            </div>
          ))}
        </div>

        <h1 className="text-2xl font-bold mb-2 text-center uppercase">
          {activeCoin}
        </h1>
        <p className="text-sm text-gray-400 mb-6 text-center">
          Stato: {status}. Punti: {chartData.length}.
        </p>

        <div className="bg-gray-900 p-4 rounded-xl">
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={["auto", "auto"]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#00FFB2"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

