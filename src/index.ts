import theme from "./theme";
import {
  button,
  ruledBox,
  rowBg,
  dayHeaderRow,
  sectionHeaderRow,
  emptyMessage,
  shorten,
  sparkline,
  verticalChart,
  enableTouchScroll,
} from "./lib/ui";
import { openUrl } from "./lib/open";
import { notifyOS } from "./lib/notify";
import { extractArticle } from "./lib/readability";
import {
  LEAGUES,
  fetchResults,
  fetchFixtures,
  fetchStandings,
  matchRow,
  standingRow,
  type League,
  type Match,
  type StandingRow,
} from "./data/football";
import { fetchWatchlist, type Quote } from "./data/stocks";
import { fetchMarketNews, type Headline } from "./data/news";
import { fetchUpcomingEvents, getIcsUrl, type CalEvent } from "./data/calendar";
import { fetchWeather, type Weather } from "./data/weather";

import {
  createCliRenderer,
  Text,
  Box,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";

const REFRESH_INTERVAL_MS = 60_000;

type Section = "home" | "football" | "stocks" | "news" | "calendar" | "reader";
type FootballView = "results" | "fixtures" | "standings";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "football", label: "Football" },
  { id: "stocks", label: "Stocks" },
  { id: "news", label: "News" },
  { id: "calendar", label: "Calendar" },
];

const FOOTBALL_VIEW_LABELS: Record<FootballView, string> = {
  results: "Results",
  fixtures: "Fixtures",
  standings: "Table",
};

type ReaderState =
  | { status: "loading"; url: string }
  | { status: "error"; url: string }
  | { status: "ready"; title: string; source: string; url: string; paragraphs: string[] };

type HomeData = {
  weather: Weather | null;
  nextMatch: Match | null;
  gainer: Quote | null;
  loser: Quote | null;
  headlines: Headline[];
  nextEvent: CalEvent | null;
};

async function loadHomeData(): Promise<HomeData> {
  const [weather, fixtures, quotes, headlines, events] = await Promise.all([
    fetchWeather().catch(() => null),
    fetchFixtures(LEAGUES[0]!).catch(() => []),
    fetchWatchlist().catch(() => []),
    fetchMarketNews().catch(() => []),
    fetchUpcomingEvents().catch(() => []),
  ]);

  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);

  return {
    weather,
    nextMatch: fixtures[0] ?? null,
    gainer: sorted[0] ?? null,
    loser: sorted.length > 1 ? sorted[sorted.length - 1]! : null,
    headlines: headlines.slice(0, 3),
    nextEvent: events[0] ?? null,
  };
}

function timeAgo(date: Date): string {
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

/** A mini day-range gauge: "low [████░░░░] high" with the price's position filled in. */
function rangeGauge(low: number, high: number, price: number, width: number): string {
  const span = high - low;
  const pos = span > 0 ? Math.round(((price - low) / span) * width) : width / 2;
  const clamped = Math.max(0, Math.min(width, pos));
  return "█".repeat(clamped) + "░".repeat(width - clamped);
}

/** Finds the most recent headline that mentions this stock by name or symbol. */
function findRelatedHeadline(q: Quote, headlines: Headline[]): Headline | undefined {
  const nameWord = q.name.split(" ")[0]!.toLowerCase();
  return headlines.find((h) => {
    const title = h.title.toLowerCase();
    return title.includes(nameWord) || title.includes(q.symbol.toLowerCase());
  });
}

function stockRow(
  renderer: CliRenderer,
  id: string,
  q: Quote,
  index: number,
  compact: boolean,
  relatedNews: Headline | undefined,
  ultraCompact: boolean,
  onOpenNews: (h: Headline) => void,
) {
  const up = q.change >= 0;
  const color = up ? theme.green : theme.red;
  const arrow = up ? "▲" : "▼";
  const symbolWidth = compact ? 8 : 9;
  const gaugeWidth = compact ? 8 : 12;
  const sparkWidth = compact ? 10 : 22;
  const chartWidth = compact ? 0 : 40;
  const chartHeight = 3;
  const monthUp = q.monthChangePct >= 0;
  const todaySeries = q.intraday.length > 1 ? q.intraday : q.history.slice(-22);
  const todayUp = todaySeries.length > 1 ? todaySeries[todaySeries.length - 1]! >= todaySeries[0]! : up;

  const box = new BoxRenderable(renderer, {
    id,
    flexDirection: "column",
    height: ultraCompact ? 1 : compact ? 3 : 2 + chartHeight + 1 + (relatedNews ? 1 : 0),
    paddingLeft: 1,
    backgroundColor: rowBg(index),
  });

  const topCells = [
    Text({
      content: q.symbol.padEnd(symbolWidth + 1),
      fg: theme.blue,
      attributes: TextAttributes.BOLD,
    }),
  ];
  if (!compact) topCells.push(Text({ content: q.name.padEnd(18), fg: theme.dim }));
  topCells.push(
    Text({
      content: q.price.toFixed(2).padStart(compact ? 9 : 10),
      fg: theme.text,
      attributes: TextAttributes.BOLD,
    }),
    Text({
      content: compact
        ? ` ${arrow}${Math.abs(q.changePct).toFixed(1)}%`
        : ` ${arrow} ${Math.abs(q.change).toFixed(2)} (${Math.abs(q.changePct).toFixed(2)}%)`,
      fg: color,
    }),
  );

  box.add(Box({ flexDirection: "row" }, ...topCells));
  if (ultraCompact) return box;

  const gaugeLine = Box(
    { flexDirection: "row" },
    Text({ content: rangeGauge(q.dayLow, q.dayHigh, q.price, gaugeWidth), fg: color }),
    compact
      ? Text({ content: "" })
      : Text({
          content: `  ${q.dayLow.toFixed(2)} – ${q.dayHigh.toFixed(2)}  day`,
          fg: theme.dim,
        }),
  );
  box.add(gaugeLine);

  if (!compact) {
    const chartColor = todayUp ? theme.green : theme.red;
    const chartLines = verticalChart(todaySeries, chartWidth, chartHeight);
    chartLines.forEach((line, i) => {
      box.add(
        Box(
          { flexDirection: "row" },
          Text({ content: line, fg: chartColor }),
          i === 0 ? Text({ content: "  intraday", fg: theme.dim }) : Text({ content: "" }),
        ),
      );
    });

    box.add(
      Box(
        { flexDirection: "row" },
        Text({ content: sparkline(q.history, sparkWidth), fg: monthUp ? theme.green : theme.red }),
        Text({
          content: `  ${monthUp ? "+" : ""}${q.monthChangePct.toFixed(1)}%  1mo`,
          fg: theme.dim,
        }),
      ),
    );

    if (relatedNews) {
      box.add(
        new TextRenderable(renderer, {
          content: `📰 ${shorten(relatedNews.title, 70)}  ↗`,
          fg: theme.dim,
          attributes: TextAttributes.UNDERLINE,
          truncate: true,
          onMouseDown: () => onOpenNews(relatedNews),
        }),
      );
    }
  }

  return box;
}

function newsRow(
  renderer: CliRenderer,
  id: string,
  h: Headline,
  index: number,
  ultraCompact: boolean,
  onOpen: (h: Headline) => void,
) {
  const box = new BoxRenderable(renderer, {
    id,
    flexDirection: "column",
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: rowBg(index),
    borderColor: theme.border,
    onMouseDown: () => onOpen(h),
  });
  box.border = ultraCompact ? false : ["top"];

  if (!ultraCompact) {
    box.add(
      new TextRenderable(renderer, {
        content: `${h.source} · ${timeAgo(h.pubDate)}`,
        fg: theme.dim,
        wrapMode: "word",
      }),
    );
  }
  box.add(
    new TextRenderable(renderer, {
      content: `${h.title}  ↗`,
      fg: theme.blue,
      attributes: TextAttributes.UNDERLINE,
      wrapMode: "word",
    }),
  );
  return box;
}

function calendarRowCells(ev: CalEvent) {
  const time = ev.allDay
    ? "all day"
    : ev.start.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });

  const cells = [
    Text({ content: time.padEnd(9), fg: theme.dim }),
    Text({ content: ev.title, fg: theme.blue }),
  ];
  if (ev.location) cells.push(Text({ content: `  · ${ev.location}`, fg: theme.dim }));
  return cells;
}

function calendarRow(
  renderer: CliRenderer,
  id: string,
  ev: CalEvent,
  index: number,
  rowHeight = 2,
) {
  const box = ruledBox(renderer, id, {
    backgroundColor: rowBg(index),
    border: false,
    height: rowHeight,
  });
  calendarRowCells(ev).forEach((cell) => box.add(cell));
  return box;
}

function navRow(
  renderer: CliRenderer,
  id: string,
  index: number,
  onTap: () => void,
  cells: unknown[],
  rowHeight = 2,
) {
  const box = ruledBox(renderer, id, {
    backgroundColor: rowBg(index),
    border: false,
    height: rowHeight,
    onMouseDown: onTap,
  });
  cells.forEach((cell) => box.add(cell));
  box.add(Text({ content: "  ›", fg: theme.dim }));
  return box;
}

function weatherCard(renderer: CliRenderer, w: Weather, ultraCompact = false) {
  const box = new BoxRenderable(renderer, {
    id: "weather-card",
    flexDirection: "column",
    height: ultraCompact ? 1 : 3,
    paddingLeft: 1,
    backgroundColor: theme.bg,
  });

  if (ultraCompact) {
    box.add(
      Box(
        { flexDirection: "row" },
        Text({
          content: `${Math.round(w.tempC)}°C`,
          fg: theme.accent,
          attributes: TextAttributes.BOLD,
        }),
        Text({ content: ` ${w.condition}`, fg: theme.text }),
        Text({ content: `  H:${Math.round(w.todayHigh)}° L:${Math.round(w.todayLow)}°`, fg: theme.dim }),
      ),
    );
    return box;
  }

  box.add(
    Box(
      { flexDirection: "row" },
      Text({
        content: `${Math.round(w.tempC)}°C`,
        fg: theme.accent,
        attributes: TextAttributes.BOLD,
      }),
      Text({ content: `  ${w.condition}`, fg: theme.text }),
      Text({ content: `  ·  ${w.city}`, fg: theme.dim }),
    ),
  );
  box.add(
    Box(
      { flexDirection: "row" },
      Text({
        content: `H:${Math.round(w.todayHigh)}° L:${Math.round(w.todayLow)}°`,
        fg: theme.dim,
      }),
      Text({ content: ` ${w.humidity}%`, fg: theme.dim }),
      Text({ content: ` ${Math.round(w.windKph)} km/h`, fg: theme.dim }),
    ),
  );
  return box;
}

const main = async () => {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  });

  const compact = renderer.terminalWidth < 60 || renderer.terminalHeight < 24;
  // Extra tier for very short screens (e.g. a squat wide-format panel) — merges the title bar
  // into the section bar and drops list rows to a single line, since normal "compact" alone
  // still assumes room for a 2-line row plus a dedicated title row.
  const ultraCompact = renderer.terminalHeight < 16;
  const barH = compact ? 2 : 3;
  const rowH = ultraCompact ? 1 : 2;

  const root = new BoxRenderable(renderer, {
    id: "main",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: theme.bg,
  });

  const globalContextLabel = new TextRenderable(renderer, {
    id: "context-label",
    content: "",
    fg: theme.blue,
    attributes: TextAttributes.BOLD,
  });
  const titleBar = new BoxRenderable(renderer, {
    id: "titlebar",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 1,
    paddingRight: 1,
    height: ultraCompact ? 1 : barH,
    backgroundColor: theme.bgPanel,
    borderColor: theme.border,
  });
  titleBar.border = ultraCompact ? false : ["bottom"];
  titleBar.add(
    new TextRenderable(renderer, {
      content: "Terminal",
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    }),
  );
  titleBar.add(globalContextLabel);
  root.add(titleBar);

  const notifyBanner = new TextRenderable(renderer, {
    id: "notify-banner",
    content: "",
    fg: theme.bg,
    backgroundColor: theme.accent,
    height: 0,
    paddingLeft: 1,
    onMouseDown: () => {
      notifyBanner.height = 0;
    },
  });
  root.add(notifyBanner);

  const panelsRow = new BoxRenderable(renderer, {
    id: "panels-row",
    width: "100%",
    flexGrow: 1,
    flexDirection: "row",
  });
  root.add(panelsRow);

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content: compact
      ? ""
      : "drag a tab to split the screen  ·  [r] refresh  ·  [Ctrl+C] quit",
    fg: theme.dim,
    height: compact ? 0 : 1,
    paddingLeft: 1,
  });
  root.add(footer);

  renderer.root.add(root);
  renderer.start();

  // ---- Shared, app-wide data caches (both panels read from the same cache) ----

  type FootballCache = {
    results: Match[] | undefined;
    fixtures: Match[] | undefined;
    standings: StandingRow[] | null | undefined;
  };
  const footballCache = new Map<string, FootballCache>();
  function getFootballCache(leagueId: string): FootballCache {
    if (!footballCache.has(leagueId))
      footballCache.set(leagueId, {
        results: undefined,
        fixtures: undefined,
        standings: undefined,
      });
    return footballCache.get(leagueId)!;
  }

  let stocksCache: Quote[] | undefined;
  let newsCache: Headline[] | undefined;
  let calendarCache: CalEvent[] | undefined;
  let homeCache: HomeData | undefined;

  // ---- Panel factory: everything needed to run one independent content pane ----

  type PanelHandle = {
    id: string;
    container: BoxRenderable;
    setSection: (s: Section) => void;
    showReader: (h: Headline) => void;
    refresh: () => void;
    getSection: () => Section;
    selectFootballView: (v: FootballView) => void;
    cycleLeague: (dir: -1 | 1) => void;
  };

  function createPanel(id: string, initialSection: Section, showClose: boolean): PanelHandle {
    const container = new BoxRenderable(renderer, {
      id: `${id}-container`,
      flexDirection: "column",
      flexGrow: 1,
      backgroundColor: theme.bg,
      borderColor: theme.border,
    });
    container.border = showClose ? ["left"] : false;

    const localContextLabel = new TextRenderable(renderer, {
      id: `${id}-context`,
      content: "",
      fg: theme.blue,
    });

    const sectionBar = new BoxRenderable(renderer, {
      id: `${id}-section-bar`,
      height: barH,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.bgAlt,
      border: ["bottom"],
      borderColor: theme.border,
    });
    container.add(sectionBar);

    const leagueBar = new ScrollBoxRenderable(renderer, {
      id: `${id}-league-bar`,
      height: barH,
      scrollY: false,
      scrollX: true,
      backgroundColor: theme.bgAlt,
      contentOptions: { flexDirection: "row" },
    });
    container.add(leagueBar);

    const viewBar = new BoxRenderable(renderer, {
      id: `${id}-view-bar`,
      height: barH,
      flexDirection: "row",
      backgroundColor: theme.bgAlt,
      border: ["bottom"],
      borderColor: theme.border,
    });
    container.add(viewBar);

    const statusText = new TextRenderable(renderer, {
      id: `${id}-status`,
      content: "",
      fg: theme.dim,
      height: 1,
      paddingLeft: 1,
    });
    container.add(statusText);

    const scrollBox = new ScrollBoxRenderable(renderer, {
      id: `${id}-content`,
      flexGrow: 1,
      backgroundColor: theme.bg,
    });
    container.add(scrollBox);
    enableTouchScroll(scrollBox);

    let currentSection: Section = initialSection;
    let currentLeague: League = LEAGUES[0]!;
    let currentFootballView: FootballView = "results";
    let reader: ReaderState | null = null;
    let loading = false;

    function clearContent() {
      [...scrollBox.content.getChildren()].forEach((child) => child.destroy());
    }

    function setFootballBarsVisible(visible: boolean) {
      leagueBar.visible = visible;
      leagueBar.height = visible ? barH : 0;
      viewBar.visible = visible;
      viewBar.height = visible ? barH : 0;
    }

    function renderFootball() {
      const data = getFootballCache(currentLeague.id);

      if (currentFootballView === "standings") {
        if (data.standings === null) {
          scrollBox.content.add(
            emptyMessage(renderer, "empty", `No full table available for ${currentLeague.name}.`),
          );
          return;
        }

        const rows = data.standings ?? [];
        scrollBox.content.add(
          standingRow(
            renderer,
            "standings-header",
            {
              rank: "#",
              team: "Team",
              played: "P",
              win: "W",
              draw: "D",
              loss: "L",
              goalsFor: "GF",
              goalsAgainst: "GA",
              goalDiff: "GD",
              points: "Pts",
            },
            true,
            compact,
            0,
            rowH,
          ),
        );
        rows.forEach((row, i) =>
          scrollBox.content.add(standingRow(renderer, `row-${i}`, row, false, compact, i, rowH)),
        );
        return;
      }

      const rows = (currentFootballView === "results" ? data.results : data.fixtures) ?? [];
      if (rows.length === 0) {
        scrollBox.content.add(
          emptyMessage(
            renderer,
            "empty",
            currentFootballView === "results" ? "No recent results." : "No fixtures this week.",
          ),
        );
        return;
      }

      let lastDate = "";
      let rowIndex = 0;
      rows.forEach((row) => {
        if (row.date !== lastDate) {
          lastDate = row.date;
          rowIndex = 0;
          scrollBox.content.add(dayHeaderRow(renderer, `day-${row.date}`, row.date, rowH));
        }
        scrollBox.content.add(matchRow(`row-${row.date}-${rowIndex}`, row, compact, rowIndex, rowH));
        rowIndex++;
      });
    }

    function renderStocks() {
      const quotes = stocksCache ?? [];
      if (quotes.length === 0) {
        scrollBox.content.add(emptyMessage(renderer, "empty", "No quotes loaded."));
        return;
      }

      let lastGroup = "";
      let rowIndex = 0;
      quotes.forEach((q) => {
        if (q.group !== lastGroup) {
          lastGroup = q.group;
          rowIndex = 0;
          scrollBox.content.add(sectionHeaderRow(renderer, `group-${q.group}`, q.group, rowH));
        }
        const related = compact ? undefined : findRelatedHeadline(q, newsCache ?? []);
        scrollBox.content.add(
          stockRow(
            renderer,
            `stock-${q.group}-${rowIndex}`,
            q,
            rowIndex,
            compact,
            related,
            ultraCompact,
            openReader,
          ),
        );
        rowIndex++;
      });
    }

    function renderNews() {
      const headlines = newsCache ?? [];
      if (headlines.length === 0) {
        scrollBox.content.add(emptyMessage(renderer, "empty", "No headlines loaded."));
        return;
      }
      headlines.forEach((h, i) =>
        scrollBox.content.add(newsRow(renderer, `news-${i}`, h, i, ultraCompact, openReader)),
      );
    }

    function renderCalendar() {
      if (!getIcsUrl()) {
        scrollBox.content.add(
          emptyMessage(
            renderer,
            "empty",
            "No calendar configured. Set CALENDAR_ICS_URL to your calendar's secret iCal address.",
          ),
        );
        return;
      }

      const events = calendarCache ?? [];
      if (events.length === 0) {
        scrollBox.content.add(
          emptyMessage(renderer, "empty", "No upcoming events in the next 14 days."),
        );
        return;
      }

      let lastDate = "";
      let rowIndex = 0;
      events.forEach((ev) => {
        const dateKey = ev.start.toISOString().slice(0, 10);
        if (dateKey !== lastDate) {
          lastDate = dateKey;
          rowIndex = 0;
          scrollBox.content.add(dayHeaderRow(renderer, `day-${dateKey}`, dateKey, rowH));
        }
        scrollBox.content.add(
          calendarRow(renderer, `event-${dateKey}-${rowIndex}`, ev, rowIndex, rowH),
        );
        rowIndex++;
      });
    }

    function renderHome() {
      const data = homeCache;
      if (!data) {
        scrollBox.content.add(emptyMessage(renderer, "empty", "No data loaded."));
        return;
      }

      scrollBox.content.add(sectionHeaderRow(renderer, "home-weather", "Weather", rowH));
      if (data.weather) scrollBox.content.add(weatherCard(renderer, data.weather, ultraCompact));
      else scrollBox.content.add(emptyMessage(renderer, "no-weather", "Weather unavailable."));

      scrollBox.content.add(sectionHeaderRow(renderer, "home-football", "Football", rowH));
      if (data.nextMatch) {
        const m = data.nextMatch;
        const nameWidth = compact ? 10 : 24;
        scrollBox.content.add(
          navRow(
            renderer,
            "home-match",
            0,
            () => selectSection("football"),
            [
              Text({ content: compact ? `${m.time}  ` : `${m.date} ${m.time}  `, fg: theme.dim }),
              Text({
                content: `${shorten(m.homeTeam, nameWidth)} vs ${shorten(m.awayTeam, nameWidth)}`,
                fg: theme.blue,
              }),
            ],
            rowH,
          ),
        );
      } else {
        scrollBox.content.add(
          emptyMessage(renderer, "no-match", "No upcoming Pro League match found."),
        );
      }

      scrollBox.content.add(sectionHeaderRow(renderer, "home-markets", "Markets", rowH));
      if (data.gainer) {
        scrollBox.content.add(
          navRow(
            renderer,
            "home-gainer",
            0,
            () => selectSection("stocks"),
            [
              Text({ content: "▲ Top gainer  ", fg: theme.green }),
              Text({
                content: `${data.gainer.symbol} `,
                fg: theme.blue,
                attributes: TextAttributes.BOLD,
              }),
              Text({ content: `+${data.gainer.changePct.toFixed(2)}%`, fg: theme.green }),
            ],
            rowH,
          ),
        );
      }
      if (data.loser) {
        scrollBox.content.add(
          navRow(
            renderer,
            "home-loser",
            1,
            () => selectSection("stocks"),
            [
              Text({ content: "▼ Top loser   ", fg: theme.red }),
              Text({
                content: `${data.loser.symbol} `,
                fg: theme.blue,
                attributes: TextAttributes.BOLD,
              }),
              Text({ content: `${data.loser.changePct.toFixed(2)}%`, fg: theme.red }),
            ],
            rowH,
          ),
        );
      }
      if (!data.gainer && !data.loser) {
        scrollBox.content.add(emptyMessage(renderer, "no-quotes", "No market data loaded."));
      }

      scrollBox.content.add(sectionHeaderRow(renderer, "home-news", "Latest News", rowH));
      if (data.headlines.length === 0) {
        scrollBox.content.add(emptyMessage(renderer, "no-news", "No headlines loaded."));
      } else {
        data.headlines.forEach((h, i) =>
          scrollBox.content.add(newsRow(renderer, `home-news-${i}`, h, i, ultraCompact, openReader)),
        );
      }

      scrollBox.content.add(sectionHeaderRow(renderer, "home-calendar", "Next Up", rowH));
      if (!getIcsUrl()) {
        scrollBox.content.add(emptyMessage(renderer, "no-cal", "No calendar configured."));
      } else if (data.nextEvent) {
        scrollBox.content.add(
          navRow(
            renderer,
            "home-event",
            0,
            () => selectSection("calendar"),
            calendarRowCells(data.nextEvent),
            rowH,
          ),
        );
      } else {
        scrollBox.content.add(emptyMessage(renderer, "no-events", "No upcoming events."));
      }
    }

    function renderReader() {
      if (!reader) {
        scrollBox.content.add(emptyMessage(renderer, "empty", "No article selected."));
        return;
      }
      if (reader.status === "loading") {
        scrollBox.content.add(emptyMessage(renderer, "loading", "Loading article..."));
        return;
      }
      if (reader.status === "error") {
        scrollBox.content.add(
          emptyMessage(renderer, "error", "Could not load a readable version of this article."),
        );
        scrollBox.content.add(
          navRow(
            renderer,
            "open-browser",
            0,
            () => openUrl(reader!.url),
            [Text({ content: "↗ Open in browser instead", fg: theme.blue })],
            rowH,
          ),
        );
        return;
      }

      scrollBox.content.add(
        new TextRenderable(renderer, {
          id: "reader-title",
          content: reader.title,
          fg: theme.accent,
          attributes: TextAttributes.BOLD,
          wrapMode: "word",
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: 1,
        }),
      );
      scrollBox.content.add(
        navRow(
          renderer,
          "open-browser",
          0,
          () => openUrl(reader!.url),
          [Text({ content: `${reader.source}  ·  ↗ open in browser`, fg: theme.dim })],
          rowH,
        ),
      );
      reader.paragraphs.forEach((p, i) => {
        scrollBox.content.add(
          new TextRenderable(renderer, {
            id: `p-${i}`,
            content: p,
            fg: theme.text,
            wrapMode: "word",
            paddingLeft: 1,
            paddingRight: 1,
            marginBottom: 1,
          }),
        );
      });
    }

    function renderView() {
      clearContent();
      if (currentSection === "home") renderHome();
      else if (currentSection === "football") renderFootball();
      else if (currentSection === "stocks") renderStocks();
      else if (currentSection === "news") renderNews();
      else if (currentSection === "calendar") renderCalendar();
      else renderReader();
    }

    function updateContextLabel() {
      let content = "";
      if (currentSection === "home") content = "Overview";
      else if (currentSection === "football")
        content = `${currentLeague.name} · ${FOOTBALL_VIEW_LABELS[currentFootballView]}`;
      else if (currentSection === "stocks") content = "Watchlist";
      else if (currentSection === "news") content = "Markets";
      else if (currentSection === "calendar") content = "Upcoming";
      else content = "Reader";

      localContextLabel.content = content;
      if (id === "p0") globalContextLabel.content = content;
    }

    function renderBars() {
      updateContextLabel();
      setFootballBarsVisible(currentSection === "football");

      [...sectionBar.getChildren()].forEach((c) => c.destroy());
      SECTIONS.forEach((s) => {
        sectionBar.add(
          button(
            renderer,
            `${id}-section-${s.id}`,
            s.label,
            s.id === currentSection,
            () => selectSection(s.id),
            1,
            barH,
            (finalX: number) => handleTabDrag(id, s.id, finalX),
          ),
        );
      });

      // Panel 0 mirrors its context into the shared global title bar already — only the
      // split-off panel needs its own inline label (plus the close affordance) here.
      if (showClose) {
        const spacer = new BoxRenderable(renderer, { id: `${id}-spacer`, flexGrow: 0.001 });
        sectionBar.add(spacer);
        sectionBar.add(localContextLabel);

        const closeBtn = new BoxRenderable(renderer, {
          id: `${id}-close`,
          paddingLeft: 1,
          paddingRight: 1,
          onMouseDown: () => closePanel1(),
        });
        closeBtn.add(new TextRenderable(renderer, { content: " ✕ ", fg: theme.red }));
        sectionBar.add(closeBtn);
      }

      if (currentSection !== "football") {
        [...leagueBar.content.getChildren()].forEach((c) => c.destroy());
        [...viewBar.getChildren()].forEach((c) => c.destroy());
        return;
      }

      [...leagueBar.content.getChildren()].forEach((c) => c.destroy());
      LEAGUES.forEach((league) => {
        leagueBar.content.add(
          button(
            renderer,
            `${id}-league-${league.id}`,
            league.short,
            league.id === currentLeague.id,
            () => selectLeague(league),
            0,
            barH,
          ),
        );
      });

      [...viewBar.getChildren()].forEach((c) => c.destroy());
      (Object.keys(FOOTBALL_VIEW_LABELS) as FootballView[]).forEach((view) => {
        viewBar.add(
          button(
            renderer,
            `${id}-view-${view}`,
            FOOTBALL_VIEW_LABELS[view],
            view === currentFootballView,
            () => selectFootballView(view),
            1,
            barH,
          ),
        );
      });
    }

    async function load(force = false) {
      if (loading) return;
      // The reader pane loads itself via showReader() — never auto-(re)loaded from here.
      if (currentSection === "reader") return;

      let already: unknown;
      if (currentSection === "home") already = homeCache;
      else if (currentSection === "football") {
        const data = getFootballCache(currentLeague.id);
        already =
          currentFootballView === "standings"
            ? data.standings
            : currentFootballView === "results"
              ? data.results
              : data.fixtures;
      } else if (currentSection === "stocks") already = stocksCache;
      else if (currentSection === "news") already = newsCache;
      else already = calendarCache;

      if (already !== undefined && !force) {
        renderView();
        return;
      }

      loading = true;
      statusText.content = "Loading...";
      statusText.fg = theme.dim;
      renderView();

      try {
        if (currentSection === "home") {
          homeCache = await loadHomeData();
        } else if (currentSection === "football") {
          const data = getFootballCache(currentLeague.id);
          if (currentFootballView === "results") data.results = await fetchResults(currentLeague);
          else if (currentFootballView === "fixtures")
            data.fixtures = await fetchFixtures(currentLeague);
          else data.standings = await fetchStandings(currentLeague);
        } else if (currentSection === "stocks") {
          const [quotes, headlines] = await Promise.all([
            fetchWatchlist(),
            newsCache ?? fetchMarketNews(),
          ]);
          stocksCache = quotes;
          newsCache = headlines;
        } else if (currentSection === "news") {
          newsCache = await fetchMarketNews();
        } else {
          calendarCache = await fetchUpcomingEvents();
        }

        statusText.content = "";
        renderView();
      } catch {
        statusText.content = "Failed to load data.";
        statusText.fg = theme.red;
      } finally {
        loading = false;
      }
    }

    function selectSection(section: Section) {
      if (loading) return;
      currentSection = section;
      renderBars();
      load();
    }

    function selectLeague(league: League) {
      if (loading) return;
      currentLeague = league;
      renderBars();
      load();
    }

    function selectFootballView(view: FootballView) {
      if (loading) return;
      currentFootballView = view;
      renderBars();
      load();
    }

    async function showReader(h: Headline) {
      currentSection = "reader";
      reader = { status: "loading", url: h.link };
      renderBars();
      renderView();

      const article = await extractArticle(h.link);
      if (!article) {
        reader = { status: "error", url: h.link };
      } else {
        reader = {
          status: "ready",
          title: article.title,
          source: h.source,
          url: h.link,
          paragraphs: article.paragraphs,
        };
      }
      if (currentSection === "reader") renderView();
    }

    function cycleLeague(dir: -1 | 1) {
      const idx = LEAGUES.findIndex((l) => l.id === currentLeague.id);
      const league = LEAGUES[(idx + dir + LEAGUES.length) % LEAGUES.length];
      if (league) selectLeague(league);
    }

    return {
      id,
      container,
      setSection: selectSection,
      showReader,
      refresh: () => load(true),
      getSection: () => currentSection,
      selectFootballView,
      cycleLeague,
    };
  }

  // ---- Orchestration: up to two panels, side by side, plus drag-to-split + reader routing ----

  const panel0 = createPanel("p0", "home", false);
  panelsRow.add(panel0.container);

  let panel1: PanelHandle | null = null;

  function ensurePanel1(initialSection: Section): PanelHandle {
    if (!panel1) {
      panel1 = createPanel("p1", initialSection, true);
      panelsRow.add(panel1.container);
    }
    return panel1;
  }

  function closePanel1() {
    if (!panel1) return;
    panel1.container.destroy();
    panel1 = null;
  }

  function handleTabDrag(_originId: string, section: Section, finalX: number) {
    const targetIsRight = finalX >= renderer.terminalWidth / 2;
    if (targetIsRight) ensurePanel1(section).setSection(section);
    else panel0.setSection(section);
  }

  /** Opens a headline in the reader panel — always the right-hand pane, per the "reader opens
   *  beside the news panel" requirement — creating that pane first if it doesn't exist yet. */
  function openReader(h: Headline) {
    ensurePanel1("reader").showReader(h);
  }

  renderer.keyInput.on("keypress", (key) => {
    if (key.name === "r") {
      panel0.refresh();
      panel1?.refresh();
      return;
    }
    if (panel0.getSection() !== "football") return;

    if (key.name === "1") panel0.selectFootballView("results");
    else if (key.name === "2") panel0.selectFootballView("fixtures");
    else if (key.name === "3") panel0.selectFootballView("standings");
    else if (key.name === "left") panel0.cycleLeague(-1);
    else if (key.name === "right") panel0.cycleLeague(1);
  });

  let notifyHideTimer: ReturnType<typeof setTimeout> | undefined;

  function pushNotification(kind: "info" | "alert", title: string, message: string) {
    clearTimeout(notifyHideTimer);
    notifyBanner.content = `🔔 ${message}`;
    notifyBanner.backgroundColor = kind === "alert" ? theme.red : theme.accent;
    notifyBanner.height = 1;
    notifyOS(title, message);
    notifyHideTimer = setTimeout(() => {
      notifyBanner.height = 0;
    }, 20_000);
  }

  const alertedMatches = new Set<string>();
  const alertedEvents = new Set<string>();
  const alertedStocks = new Set<string>();
  const MATCH_ALERT_MINUTES = 15;
  const EVENT_ALERT_MINUTES = 15;
  const STOCK_ALERT_PCT = 3;

  async function checkAlerts() {
    try {
      const [fixtures, quotes, events] = await Promise.all([
        fetchFixtures(LEAGUES[0]!).catch(() => []),
        fetchWatchlist().catch(() => []),
        fetchUpcomingEvents().catch(() => []),
      ]);

      const now = Date.now();

      for (const m of fixtures) {
        const key = `${m.date}-${m.time}-${m.homeTeam}`;
        if (alertedMatches.has(key)) continue;
        const kickoff = new Date(`${m.date}T${m.time}:00`).getTime();
        const minsAway = (kickoff - now) / 60_000;
        if (minsAway >= 0 && minsAway <= MATCH_ALERT_MINUTES) {
          alertedMatches.add(key);
          pushNotification(
            "info",
            "Kickoff soon",
            `${m.homeTeam} vs ${m.awayTeam} starts in ${Math.max(0, Math.round(minsAway))} min`,
          );
        }
      }

      for (const q of quotes) {
        if (alertedStocks.has(q.symbol)) continue;
        if (Math.abs(q.changePct) >= STOCK_ALERT_PCT) {
          alertedStocks.add(q.symbol);
          const dir = q.changePct >= 0 ? "up" : "down";
          pushNotification(
            "alert",
            "Price move",
            `${q.symbol} is ${dir} ${Math.abs(q.changePct).toFixed(1)}% today`,
          );
        }
      }

      for (const ev of events) {
        const key = `${ev.title}-${ev.start.toISOString()}`;
        if (alertedEvents.has(key)) continue;
        const minsAway = (ev.start.getTime() - now) / 60_000;
        if (minsAway >= 0 && minsAway <= EVENT_ALERT_MINUTES) {
          alertedEvents.add(key);
          pushNotification(
            "info",
            "Upcoming event",
            `${ev.title} in ${Math.max(0, Math.round(minsAway))} min`,
          );
        }
      }
    } catch {
      // best-effort background check — a failed fetch here shouldn't disrupt the UI
    }
  }

  setInterval(() => {
    panel0.refresh();
    panel1?.refresh();
  }, REFRESH_INTERVAL_MS);

  setInterval(checkAlerts, 30_000);
  checkAlerts();

  panel0.setSection("home");
};

main();
