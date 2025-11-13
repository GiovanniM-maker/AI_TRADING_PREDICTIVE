import { NextResponse } from "next/server";
import { getMarketChart } from "@/utils/coingecko";
import { db } from "@/lib/firebase";
import {
  doc,
  collection,
  writeBatch,
} from "firebase/firestore";
import { monitoredSetDoc } from "@/lib/firestore_monitored";

const coins = [
  {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  },
  {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  },
  {
    id: "solana",
    name: "Solana",
    symbol: "SOL",
    image: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  },
  {
    id: "binancecoin",
    name: "BNB",
    symbol: "BNB",
    image:
      "https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png",
  },
  {
    id: "dogecoin",
    name: "Dogecoin",
    symbol: "DOGE",
    image: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
  },
  {
    id: "ripple",
    name: "XRP",
    symbol: "XRP",
    image:
      "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  },
];

export async function POST() {
  try {
    let imported = 0;

    for (const coin of coins) {
      const ref = doc(db, "coins", coin.id);
      await monitoredSetDoc(
        ref,
        { ...coin, updatedAt: new Date() },
        { merge: true }
      );

      const chart = await getMarketChart(coin.id, "usd", 1, "hourly");
      const prices = chart?.prices || [];
      const pricesCol = collection(ref, "prices");
      const batch = writeBatch(db);

      for (const [ts, price] of prices) {
        batch.set(doc(pricesCol, String(ts)), {
          price,
          ts: new Date(ts),
        });
      }

      await batch.commit();
      imported++;
    }

    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}

