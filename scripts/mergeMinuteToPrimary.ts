import { config } from "dotenv";
import { cert, getApps, initializeApp, AppOptions } from "firebase-admin/app";
import {
  getFirestore,
  Firestore,
  DocumentData,
  CollectionReference,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

config({ path: ".env.local" });
config();

type Coin = {
  symbol: string;
  label: string;
};

type MinuteDoc = {
  time: string;
  close: number;
  source?: string;
  symbol?: string;
};

const COINS: Coin[] = [
  { symbol: "BTCUSDT", label: "Bitcoin" },
  { symbol: "ETHUSDT", label: "Ethereum" },
  { symbol: "SOLUSDT", label: "Solana" },
  { symbol: "BNBUSDT", label: "BNB" },
  { symbol: "DOGEUSDT", label: "Dogecoin" },
  { symbol: "XRPUSDT", label: "Ripple" },
];

const CHUNK_SIZE = 400;

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
  const privateKey = getEnv("PRIVATE_KEY").replace(/\\n/g, "\n");

  const options: AppOptions = {
    projectId,
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  };

  initializeApp(options);
  return getFirestore();
}

async function deleteDocs(
  db: Firestore,
  collectionRef: CollectionReference<DocumentData>,
  ids: string[]
) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + CHUNK_SIZE)) {
      batch.delete(collectionRef.doc(id));
    }
    await batch.commit();
  }
}

async function writeDocs(
  db: Firestore,
  collectionRef: CollectionReference<DocumentData>,
  docs: MinuteDoc[]
) {
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    const slice = docs.slice(i, i + CHUNK_SIZE);
    slice.forEach((docData) => {
      batch.set(
        collectionRef.doc(docData.time),
        {
          ...docData,
          source: docData.source ?? "yahoo_minute",
          symbol: docData.symbol,
        },
        { merge: false }
      );
    });
    await batch.commit();
  }
}

async function mergeCoin(db: Firestore, coin: Coin) {
  console.log(`\n➡️  Merging minute data into primary for ${coin.label} (${coin.symbol})`);

  const minuteHistoryRef = db
    .collection("crypto_prices_minute")
    .doc(coin.symbol)
    .collection("history_minute");
  const minuteSnapshot = await minuteHistoryRef.orderBy("time", "asc").get();

  if (minuteSnapshot.empty) {
    console.log("   Nessun dato minuto trovato, salto.");
    return;
  }

  const minuteDocs: MinuteDoc[] = minuteSnapshot.docs
    .map((snap) => snap.data() as MinuteDoc)
    .filter(
      (item) =>
        typeof item?.time === "string" &&
        typeof item?.close === "number" &&
        Number.isFinite(item.close)
    )
    .map((item) => ({
      ...item,
      symbol: coin.symbol,
      source: item.source ?? "yahoo_minute",
    }));

  if (minuteDocs.length === 0) {
    console.log("   Nessun dato minuto valido, salto.");
    return;
  }

  const minTime = minuteDocs[0].time;
  const maxTime = minuteDocs[minuteDocs.length - 1].time;

  const primaryRef = db
    .collection("crypto_prices")
    .doc(coin.symbol)
    .collection("history_yahoo");
  const conflictedSnapshot = await primaryRef
    .where("time", ">=", minTime)
    .where("time", "<=", maxTime)
    .get();

  const toDeleteIds = conflictedSnapshot.docs.map((snap) => snap.id);
  if (toDeleteIds.length > 0) {
    console.log(`   Rimuovo ${toDeleteIds.length} record esistenti sovrapposti...`);
    await deleteDocs(db, primaryRef, toDeleteIds);
  }

  console.log(`   Scrivo ${minuteDocs.length} record minuto...`);
  await writeDocs(db, primaryRef, minuteDocs);

  const last = minuteDocs[minuteDocs.length - 1];
  await db.collection("crypto_prices").doc(coin.symbol).set(
    {
      symbol: coin.symbol,
      lastYahooClose: last.close,
      lastYahooSync: last.time,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(
    `✅ Merge completato per ${coin.symbol} — ultimi dati ${last.time}, ${last.close}`
  );
}

async function main() {
  const db = initFirebase();
  for (const coin of COINS) {
    try {
      await mergeCoin(db, coin);
    } catch (error) {
      console.error(`❌ Errore durante il merge di ${coin.symbol}:`, error);
    }
  }

  console.log("\n==== Merge completato. I dati minuto ora sono sulla tabella principale. ====");
  process.exit(0);
}

main().catch((error) => {
  console.error("Errore inatteso:", error);
  process.exit(1);
});

