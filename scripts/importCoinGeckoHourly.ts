import { config } from "dotenv";
import { cert, getApps, initializeApp, AppOptions } from "firebase-admin/app";
import {
  Firestore,
  getFirestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";
import { getMarketChart } from "../utils/coingecko.js";

config({ path: ".env.local" });
config();

type CoinConfig = {
  id: string;
  symbol: string;
  label: string;
};

type HourlyRecord = {
  time: string;
  close: number;
  source: "coingecko_hourly";
  symbol: string;
};

const COINS: CoinConfig[] = [
  { id: "bitcoin", symbol: "BTCUSDT", label: "Bitcoin" },
  { id: "ethereum", symbol: "ETHUSDT", label: "Ethereum" },
  { id: "solana", symbol: "SOLUSDT", label: "Solana" },
  { id: "binancecoin", symbol: "BNBUSDT", label: "BNB" },
  { id: "dogecoin", symbol: "DOGEUSDT", label: "Dogecoin" },
  { id: "ripple", symbol: "XRPUSDT", label: "Ripple" },
];

const CHUNK_SIZE = 450;
const DAYS = 30;

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
  records: HourlyRecord[]
) {
  for (let index = 0; index < records.length; index += CHUNK_SIZE) {
    const batch = db.batch();
    const slice = records.slice(index, index + CHUNK_SIZE);
    slice.forEach((record) => {
      batch.set(collection.doc(record.time), record, { merge: true });
    });
    await batch.commit();
  }
}

async function importCoin(
  db: Firestore,
  coin: CoinConfig
): Promise<{ count: number }> {
  console.log(`⏬ Download hourly data for ${coin.label} (${coin.symbol})...`);

  const chart = await getMarketChart(coin.id, "usd", DAYS, "hourly");
  const prices: Array<[number, number]> = chart?.prices ?? [];

  if (!Array.isArray(prices) || prices.length === 0) {
    console.warn(`⚠️  No hourly data returned for ${coin.id}.`);
    return { count: 0 };
  }

  const records: HourlyRecord[] = prices
    .map(([timestamp, price]) => {
      if (typeof timestamp !== "number" || typeof price !== "number") {
        return null;
      }
      return {
        time: new Date(timestamp).toISOString(),
        close: price,
        source: "coingecko_hourly" as const,
        symbol: coin.symbol,
      };
    })
    .filter((record): record is HourlyRecord => record !== null);

  const parentDoc = db.collection("crypto_prices_hourly").doc(coin.symbol);
  const historyCollection = parentDoc.collection("history_hourly");

  await writeInChunks(db, historyCollection, records);

  const last = records[records.length - 1];
  await parentDoc.set(
    {
      symbol: coin.symbol,
      lastSync: last?.time ?? null,
      lastClose: last?.close ?? null,
      source: "coingecko_hourly",
      updatedAt: new Date().toISOString(),
      days: DAYS,
      count: records.length,
    },
    { merge: true }
  );

  console.log(
    `✅ ${coin.symbol} — ${records.length} hourly points stored (last ${last?.time ?? "n/a"})`
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
      console.error(`❌ Failed to import ${coin.symbol}:`, error);
    }
  }
  console.log(`\n==== Hourly import completed (${total} records total) ====`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});

