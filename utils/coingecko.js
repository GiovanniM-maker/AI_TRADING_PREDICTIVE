const CG_BASE = "https://api.coingecko.com/api/v3";

export async function getMarketChart(
  coinId,
  vs = "usd",
  days = 1,
  interval = "hourly"
) {
  const url = `${CG_BASE}/coins/${coinId}/market_chart?vs_currency=${vs}&days=${days}&interval=${interval}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`CoinGecko market chart error: ${coinId} ${res.status}`);
  }
  return res.json();
}

export async function getCurrentPrice(coinId, vs = "usd") {
  const url = `${CG_BASE}/simple/price?ids=${coinId}&vs_currencies=${vs}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CoinGecko current price error: ${res.status}`);
  }
  return res.json();
}

