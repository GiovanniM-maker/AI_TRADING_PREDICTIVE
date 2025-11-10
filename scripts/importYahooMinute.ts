import { config } from "dotenv";
import YahooFinance from "yahoo-finance2";
import { cert, getApps, initializeApp, AppOptions } from "firebase-admin/app";
import {
  CollectionReference,
  DocumentData,
  Firestore,
  getFirestore,
} from "firebase-admin/firestore";

config({ path: ".env.local" });
config();

type CoinConfig = {
  ticker: string;
  symbol: string;
  label: string;
};

type MinuteRecord = {
  time: string;
  close: number;
  source: "yahoo_minute";
  symbol: string;
};

const COINS: CoinConfig[] = [
  { ticker: "BTC-USD", symbol: "BTCUSDT", label: "Bitcoin" },
  { ticker: "ETH-USD", symbol: "ETHUSDT", label: "Ethereum" },
  { ticker: "SOL-USD", symbol: "SOLUSDT", label: "Solana" },
  { ticker: "BNB-USD", symbol: "BNBUSDT", label: "BNB" },
  { ticker: "DOGE-USD", symbol: "DOGEUSDT", label: "Dogecoin" },
  { ticker: "XRP-USD", symbol: "XRPUSDT", label: "Ripple" },
];

const CHUNK_SIZE = 450;
const DAYS = 7; // Yahoo allows up to 8 days for 1m granularity

function getEnv(name: string): string {
  const value = process.env[`FIREBASE_${name}`];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing environment variable FIREBASE_${name}`);
  }
  return value;
}

function initFirebase(): Firestore {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const projectId = getEnv("PROJECT_ID");
  const clientEmail = getEnv("CLIENT_EMAIL");
  const rawPrivateKey = getEnv("PRIVATE_KEY");

  const options: AppOptions = {
    projectId,
    credential: cert({
      projectId,
      clientEmail,
      privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
    }),
  };

  initializeApp(options);
  return getFirestore();
}

async function writeInChunks(
  db: Firestore,
  collection: CollectionReference<DocumentData>,
  records: MinuteRecord[]
) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    const chunk = records.slice(i, i + CHUNK_SIZE);
    chunk.forEach((record) => {
      batch.set(collection.doc(record.time), record, { merge: true });
    });
    await batch.commit();
  }
}

async function importCoin(
  db: Firestore,
  coin: CoinConfig
): Promise<{ count: number }> {
  console.log(`⏬ Download minute data for ${coin.label} (${coin.symbol})...`);

  const yf = new YahooFinance();
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - DAYS * 24 * 60 * 60 * 1000);

  const chart = await yf.chart(coin.ticker, {
    interval: "1m",
    period1,
    period2,
  });

  const quotes: Array<{ date?: Date; close?: number | null }> =
    chart?.quotes ?? [];

  if (!Array.isArray(quotes) || quotes.length === 0) {
    console.warn(`⚠️  No quotes returned for ${coin.ticker}`);
    return { count: 0 };
  }

  const records: MinuteRecord[] = quotes
    .filter((quote) => quote?.date instanceof Date && typeof quote.close === "number")
    .map((quote) => ({
      time: (quote.date as Date).toISOString(),
      close: quote.close as number,
      source: "yahoo_minute" as const,
      symbol: coin.symbol,
    }));

  const parentDoc = db.collection("crypto_prices_minute").doc(coin.symbol);
  const historyCollection = parentDoc.collection("history_minute");

  await writeInChunks(db, historyCollection, records);

  const last = records[records.length - 1];
  await parentDoc.set(
    {
      symbol: coin.symbol,
      lastSync: last?.time ?? null,
      lastClose: last?.close ?? null,
      source: "yahoo_minute",
      updatedAt: new Date().toISOString(),
      days: DAYS,
      count: records.length,
    },
    { merge: true }
  );

  console.log(
    `✅ ${coin.symbol} — ${records.length} minute records stored (last ${last?.time ?? "n/a"})`
  );

  return { count: records.length };
}

async function main() {
  const db = initFirebase();
  let total = 0;

  for (const coin of COINS) {
    try {
      const { count } = await importCoin(db, coin);
      total += count;
    } catch (error) {
      console.error(`❌ Failed to import ${coin.symbol}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n==== Minute import completed (${total} records total) ====`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});

