import { config } from "dotenv";
import yahooFinance from "yahoo-finance2";
import { cert, getApps, initializeApp, AppOptions } from "firebase-admin/app";

config({ path: ".env.local" });
config();
import {
  Firestore,
  getFirestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

type CoinConfig = {
  ticker: string;
  symbol: string;
};

const COINS: CoinConfig[] = [
  { ticker: "BTC-USD", symbol: "BTCUSDT" },
  { ticker: "ETH-USD", symbol: "ETHUSDT" },
  { ticker: "SOL-USD", symbol: "SOLUSDT" },
  { ticker: "BNB-USD", symbol: "BNBUSDT" },
  { ticker: "DOGE-USD", symbol: "DOGEUSDT" },
  { ticker: "XRP-USD", symbol: "XRPUSDT" },
];

type HistoryRecord = {
  time: string;
  close: number;
  source: "yahoo";
  symbol: string;
};

function getEnv(name: string, required = true): string | undefined {
  const key = `VITE_FIREBASE_${name}`;
  const value = process.env[key];
  if (required && (!value || value.trim().length === 0)) {
    throw new Error(`Missing environment variable ${key}`);
  }
  return value;
}

function initFirebase(): Firestore {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const projectId = getEnv("PROJECT_ID")!;
  const clientEmail =
    getEnv("CLIENT_EMAIL", false) ?? getEnv("SERVICE_ACCOUNT_EMAIL", false);
  const privateKeyRaw =
    getEnv("PRIVATE_KEY", false) ?? getEnv("SERVICE_ACCOUNT_PRIVATE_KEY", false);

  const appOptions: AppOptions = {
    projectId,
  };

  if (clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    appOptions.credential = cert({
      projectId,
      clientEmail,
      privateKey,
    });
  } else {
    console.warn(
      "⚠️  Firebase Admin credentials not fully provided. Falling back to default credentials."
    );
  }

  initializeApp(appOptions);
  return getFirestore();
}

async function historyExists(collection: CollectionReference<DocumentData>) {
  const snap = await collection.limit(1).get();
  return !snap.empty;
}

async function writeInChunks(
  db: Firestore,
  collection: CollectionReference<DocumentData>,
  records: HistoryRecord[]
) {
  const chunkSize = 450;
  for (let i = 0; i < records.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = records.slice(i, i + chunkSize);
    for (const record of chunk) {
      const docRef = collection.doc(record.time);
      batch.set(docRef, record, { merge: false });
    }
    await batch.commit();
  }
}

async function importCoin(
  db: Firestore,
  coin: CoinConfig
): Promise<{ count: number; last?: HistoryRecord }> {
  const parentDoc = db.collection("crypto_prices").doc(coin.symbol);
  const historyCol = parentDoc.collection("history_yahoo");

  const exists = await historyExists(historyCol);
  if (exists) {
    console.log(`⏭️  ${coin.symbol} — history_yahoo già presente, salto.`);
    return { count: 0 };
  }

  console.log(`⏬ Scarico storico per ${coin.symbol} da Yahoo Finance...`);

  const chart = await yahooFinance.chart(coin.ticker, {
    interval: "1d",
    range: "max",
  });

  const result = chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    throw new Error(`Dati non disponibili per ${coin.ticker}`);
  }

  const closes = result.indicators.quote[0].close;
  const records: HistoryRecord[] = [];

  result.timestamp.forEach((ts, idx) => {
    const close = closes[idx];
    if (typeof close !== "number" || Number.isNaN(close)) {
      return;
    }
    const iso = new Date(ts * 1000).toISOString();
    records.push({
      time: iso,
      close,
      source: "yahoo",
      symbol: coin.symbol,
    });
  });

  if (records.length === 0) {
    console.log(`⚠️  Nessun dato valido trovato per ${coin.symbol}`);
    return { count: 0 };
  }

  await writeInChunks(db, historyCol, records);

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
    `✅ ${coin.symbol} — ${records.length} record caricati — ultimo valore ${last.close.toFixed(
      2
    )} (${last.time})`
  );

  return { count: records.length, last };
}

async function main() {
  const db = initFirebase();

  for (const coin of COINS) {
    try {
      await importCoin(db, coin);
    } catch (error) {
      console.error(`❌ Errore import ${coin.symbol}:`, (error as Error).message);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Errore inatteso:", err);
  process.exit(1);
});

