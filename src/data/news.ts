import { fetchText } from "../lib/http";

const FEEDS = [
  { url: "https://www.cnbc.com/id/20409666/device/rss/rss.html", source: "CNBC" }, // Market Insider
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", source: "CNBC" }, // Finance
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", source: "CNBC World" }, // Int'l top news
];

export type Headline = {
  title: string;
  source: string;
  pubDate: Date;
  link: string;
};

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decodeEntities(match[1] ?? "") : "";
}

function parseFeed(xml: string, source: string): Headline[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item) => {
      const title = tag(item, "title");
      const pubDateRaw = tag(item, "pubDate");
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date(0);
      return { title, source, pubDate, link: tag(item, "link") };
    })
    .filter((h) => h.title.length > 0);
}

/** Aggregated, deduplicated, most-recent-first market headlines from a handful of free RSS feeds. */
export async function fetchMarketNews(): Promise<Headline[]> {
  const results = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const xml = await fetchText(feed.url);
        return parseFeed(xml, feed.source);
      } catch {
        return [];
      }
    }),
  );

  const seen = new Set<string>();
  return results
    .flat()
    .filter((h) => {
      const key = h.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 25);
}
