import { fetchJson } from "../lib/http";

export type Ticker = { symbol: string; label: string; group: string };

export const WATCHLIST: Ticker[] = [
  { symbol: "^GSPC", label: "S&P 500", group: "World Indices" },
  { symbol: "^IXIC", label: "Nasdaq Composite", group: "World Indices" },
  { symbol: "^DJI", label: "Dow Jones", group: "World Indices" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50", group: "World Indices" },
  { symbol: "^BFX", label: "Bel 20", group: "World Indices" },
  { symbol: "^GDAXI", label: "DAX", group: "World Indices" },
  { symbol: "^FTSE", label: "FTSE 100", group: "World Indices" },
  { symbol: "^N225", label: "Nikkei 225", group: "World Indices" },
  { symbol: "AAPL", label: "Apple", group: "Big Tech" },
  { symbol: "MSFT", label: "Microsoft", group: "Big Tech" },
  { symbol: "GOOGL", label: "Alphabet", group: "Big Tech" },
  { symbol: "AMZN", label: "Amazon", group: "Big Tech" },
  { symbol: "TSLA", label: "Tesla", group: "Big Tech" },
  { symbol: "NVDA", label: "Nvidia", group: "Big Tech" },
  { symbol: "META", label: "Meta", group: "Big Tech" },
];

export type Quote = {
  symbol: string;
  name: string;
  group: string;
  currency: string;
  price: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  /** Daily closes over the past ~1 month, oldest first — for the 1mo trend line. */
  history: number[];
  /** Change over the history window, as a percentage. */
  monthChangePct: number;
  /** 5-minute closes for today so far, oldest first — empty outside/before market hours. */
  intraday: number[];
};

async function fetchChart(symbol: string, interval: string, range: string): Promise<any> {
  return fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
  );
}

async function fetchQuote(ticker: Ticker): Promise<Quote | null> {
  try {
    const [dailyData, intradayData] = await Promise.all([
      fetchChart(ticker.symbol, "1d", "1mo"),
      fetchChart(ticker.symbol, "5m", "1d").catch(() => null),
    ]);

    const result = dailyData?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;

    const price = meta.regularMarketPrice;

    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const history = closes.filter((c): c is number => typeof c === "number");

    // With range=1mo, Yahoo's previousClose/chartPreviousClose reflect the START of that
    // range (~1 month ago), not yesterday — so the true prior trading day's close has to come
    // from the second-to-last point in the daily closes series instead.
    const prevClose =
      history.length > 1 ? history[history.length - 2]! : (meta.previousClose ?? meta.chartPreviousClose ?? price);
    const change = price - prevClose;

    const monthChangePct =
      history.length > 1 ? ((history[history.length - 1]! - history[0]!) / history[0]!) * 100 : 0;

    const intradayCloses: (number | null)[] =
      intradayData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const intraday = intradayCloses.filter((c): c is number => typeof c === "number");

    return {
      symbol: ticker.symbol.replace(/^\^/, ""),
      name: ticker.label,
      group: ticker.group,
      currency: meta.currency ?? "USD",
      price,
      change,
      changePct: prevClose ? (change / prevClose) * 100 : 0,
      dayHigh: meta.regularMarketDayHigh ?? price,
      dayLow: meta.regularMarketDayLow ?? price,
      history,
      monthChangePct,
      intraday,
    };
  } catch {
    return null;
  }
}

/** Grouped by ticker.group, in WATCHLIST order — groups render as sections in the UI. */
export async function fetchWatchlist(): Promise<Quote[]> {
  const quotes = await Promise.all(WATCHLIST.map(fetchQuote));
  return quotes.filter((q): q is Quote => q !== null);
}
