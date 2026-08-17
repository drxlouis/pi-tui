export type Article = {
  title: string;
  paragraphs: string[];
};

const MIN_PARAGRAPH_LENGTH = 40;
const MAX_PARAGRAPHS = 60;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return NAMED_ENTITIES[code] ?? match;
  });
}

/**
 * Lightweight in-app "reader mode": pulls <title>/<h1> and <p> text out of a page via Bun's
 * HTMLRewriter (no external readability library / network calls beyond the one fetch).
 * Imperfect on heavily templated pages, but good enough for a quick in-panel read.
 */
export async function extractArticle(url: string): Promise<Article | null> {
  try {
    const res = await fetch(url);
    const html = await res.text();

    let title = "";
    let h1 = "";
    const paragraphs: string[] = [];
    let current = "";

    const rewriter = new HTMLRewriter()
      .on("title", {
        text(t) {
          title += t.text;
        },
      })
      .on("h1", {
        text(t) {
          h1 += t.text;
        },
      })
      .on("p", {
        text(t) {
          current += t.text;
          if (t.lastInTextNode) {
            const trimmed = current.replace(/\s+/g, " ").trim();
            if (trimmed.length >= MIN_PARAGRAPH_LENGTH && paragraphs.length < MAX_PARAGRAPHS) {
              paragraphs.push(trimmed);
            }
            current = "";
          }
        },
      });

    await rewriter.transform(new Response(html)).text();

    if (paragraphs.length === 0) return null;

    return {
      title: decodeEntities(h1.trim() || title.trim() || "Untitled").replace(/\s+/g, " "),
      paragraphs: paragraphs.map(decodeEntities),
    };
  } catch {
    return null;
  }
}
