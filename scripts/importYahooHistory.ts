import { config } from "dotenv";
import yahooFinance from "yahoo-finance2";
const yf = new (yahooFinance as unknown as { new (): { chart: typeof yahooFinance.chart } })();
import { cert, getApps, initializeApp, AppOptions } from "firebase-admin/app";
import {
  Firestore,
  getFirestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

config({ path: ".env.local" });
config();

type CoinConfig = {
  ticker: string;
  symbol: string;
};

type HistoryRecord = {
  time: string;
  close: number;
  source: "yahoo";
  symbol: string;
};

type CoinResult = {
  symbol: string;
  status: "success" | "skipped" | "error";
  imported: number;
  written: number;
  message?: string;
};

const COINS: CoinConfig[] = [
  { ticker: "BTC-USD", symbol: "BTCUSDT" },
  { ticker: "ETH-USD", symbol: "ETHUSDT" },
  { ticker: "SOL-USD", symbol: "SOLUSDT" },
  { ticker: "BNB-USD", symbol: "BNBUSDT" },
  { ticker: "DOGE-USD", symbol: "DOGEUSDT" },
  { ticker: "XRP-USD", symbol: "XRPUSDT" },
];

const CHUNK_SIZE = 450;

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
  const privateKeyRaw = getEnv("PRIVATE_KEY");

  const appOptions: AppOptions = {
    projectId,
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    }),
  };

  initializeApp(appOptions);
  return getFirestore();
}

async function collectionExists(
  collection: CollectionReference<DocumentData>
) {
  const snap = await collection.limit(1).get();
  return !snap.empty;
}

async function writeInChunks(
  db: Firestore,
  collection: CollectionReference<DocumentData>,
  records: HistoryRecord[]
): Promise<number> {
  let written = 0;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    const chunk = records.slice(i, i + CHUNK_SIZE);
    for (const record of chunk) {
      batch.set(collection.doc(record.time), record, { merge: false });
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

async function importCoin(db: Firestore, coin: CoinConfig): Promise<CoinResult> {
  const result: CoinResult = {
    symbol: coin.symbol,
    status: "success",
    imported: 0,
    written: 0,
  };

  try {
    console.log(`⏬ Downloading ${coin.ticker}...`);

    const parentDoc = db.collection("crypto_prices").doc(coin.symbol);
    const historyCol = parentDoc.collection("history_yahoo");

    if (await collectionExists(historyCol)) {
      result.status = "skipped";
      result.message = "history_yahoo already exists, skipping";
      console.log(
        `⏭️  ${coin.symbol} — history_yahoo già presente, salto import.`
      );
      return result;
    }

    const yahooData = (await yf.chart(coin.ticker, {
      interval: "1d",
      period1: new Date(0),
      period2: new Date(),
    })) as any;

    const quotes: Array<{ date?: Date; close?: number | null }> =
      yahooData?.quotes ?? [];

    if (!Array.isArray(quotes) || quotes.length === 0) {
      throw new Error("Dati non disponibili");
    }

    const records: HistoryRecord[] = quotes
      .filter((quote) => quote?.date instanceof Date && typeof quote.close === "number")
      .map((quote) => ({
        time: (quote.date as Date).toISOString(),
        close: quote.close as number,
        source: "yahoo" as const,
        symbol: coin.symbol,
      }));

    result.imported = records.length;

    if (records.length === 0) {
      throw new Error("Nessun dato valido trovato");
    }

    const written = await writeInChunks(db, historyCol, records);
    result.written = written;

    const last = records[records.length - 1];
    await parentDoc.set(
      {
        symbol: coin.symbol,
        lastYahooSync: last.time,
        lastYahooClose: last.close,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log(
      `✅ ${coin.symbol} — ${records.length} record Yahoo / ${written} scritti su Firestore`
    );
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    result.status = "error";
    result.message = message;
    console.error(`❌ ${coin.symbol} — ${message}`);
    return result;
  }
}

async function main() {
  const db = initFirebase();
  const results: CoinResult[] = [];

  for (const coin of COINS) {
    const res = await importCoin(db, coin);
    results.push(res);
  }

  console.log("\n==== IMPORT YAHOO COMPLETATO ====");
  for (const res of results) {
    if (res.status === "success") {
      console.log(`✅ ${res.symbol}`);
    } else if (res.status === "skipped") {
      console.log(`⏭️  ${res.symbol} — ${res.message}`);
    } else {
      console.log(`❌ ${res.symbol} — ${res.message}`);
    }
  }
  console.log("=================================");

  const hasErrors = results.some((res) => res.status === "error");
  process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
  console.error("Errore inatteso:", err);
  process.exit(1);
});

