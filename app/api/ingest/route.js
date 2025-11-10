import { NextResponse } from "next/server";
import { getCurrentPrice } from "@/utils/coingecko";
import { db } from "@/lib/firebase";
import {
  getDocs,
  collection,
  doc,
  setDoc,
} from "firebase/firestore";

export async function GET() {
  try {
    const snap = await getDocs(collection(db, "coins"));
    const now = Date.now();
    let updated = 0;

    for (const coinDoc of snap.docs) {
      const coinId = coinDoc.id;
      const priceObj = await getCurrentPrice(coinId, "usd");
      const price = priceObj?.[coinId]?.usd;
      if (typeof price !== "number") continue;

      await setDoc(
        doc(db, "coins", coinId, "prices", String(now)),
        {
          price,
          ts: new Date(now),
        }
      );
      await setDoc(
        doc(db, "coins", coinId),
        {
          lastPrice: price,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      updated++;
    }

    return NextResponse.json({ ok: true, updated, ts: now });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}

