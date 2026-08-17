import { Text, Box, type CliRenderer } from "@opentui/core";
import theme from "../theme";
import { fetchJson, DAY_MS, toYyyyMmDd } from "../lib/http";
import { shorten, rowBg, ruledBox } from "../lib/ui";

const API_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const ESPN_BASE = "https://site.api.espn.com/apis/v2/sports/soccer";
const ESPN_SCOREBOARD_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

export type League = {
  id: string;
  short: string;
  name: string;
  /** ESPN league slug for full standings; omitted when ESPN has no data for this competition. */
  espnSlug?: string;
};

export const LEAGUES: League[] = [
  { id: "4338", short: "BE1", name: "Pro League", espnSlug: "bel.1" },
  { id: "4623", short: "BE2", name: "Challenger Pro League" },
  { id: "4480", short: "UCL", name: "Champions League", espnSlug: "uefa.champions" },
  { id: "4328", short: "ENG", name: "Premier League", espnSlug: "eng.1" },
  { id: "4335", short: "ESP", name: "La Liga", espnSlug: "esp.1" },
  { id: "4331", short: "GER", name: "Bundesliga", espnSlug: "ger.1" },
  { id: "4332", short: "ITA", name: "Serie A", espnSlug: "ita.1" },
  { id: "4334", short: "FRA", name: "Ligue 1", espnSlug: "fra.1" },
];

export type Match = {
  date: string;
  time: string;
  round: string;
  status: string;
  live: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
};

export type StandingRow = {
  rank: string;
  team: string;
  played: string;
  win: string;
  draw: string;
  loss: string;
  goalsFor: string;
  goalsAgainst: string;
  goalDiff: string;
  points: string;
};

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "P", "LIVE"]);

function formatTime(time: string): string {
  return time.slice(0, 5);
}

async function fetchResultsSportsDb(leagueId: string): Promise<Match[]> {
  const data = await fetchJson(`${API_BASE}/eventspastleague.php?id=${leagueId}`);
  const events = data.events ?? [];

  return events
    .filter((e: any) => e.intHomeScore !== null && e.intAwayScore !== null)
    .sort((a: any, b: any) =>
      `${b.dateEvent}${b.strTime}`.localeCompare(`${a.dateEvent}${a.strTime}`),
    )
    .slice(0, 20)
    .map((e: any) => ({
      date: e.dateEvent,
      time: formatTime(e.strTime ?? ""),
      round: e.intRound ?? "",
      status: e.strStatus ?? "FT",
      live: LIVE_STATUSES.has(e.strStatus),
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: e.intHomeScore ?? "-",
      awayScore: e.intAwayScore ?? "-",
    }));
}

async function fetchFixturesSportsDb(leagueId: string): Promise<Match[]> {
  const data = await fetchJson(`${API_BASE}/eventsnextleague.php?id=${leagueId}`);
  const events = data.events ?? [];

  return events
    .sort((a: any, b: any) =>
      `${a.dateEvent}${a.strTime}`.localeCompare(`${b.dateEvent}${b.strTime}`),
    )
    .slice(0, 40)
    .map((e: any) => ({
      date: e.dateEvent,
      time: formatTime(e.strTime ?? ""),
      round: e.intRound ?? "",
      status: e.strStatus ?? "NS",
      live: LIVE_STATUSES.has(e.strStatus),
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: "",
      awayScore: "",
    }));
}

function mapEspnEvent(e: any): Match {
  const comp = e.competitions[0];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  const statusType = comp.status.type;
  const isLive = statusType.state === "in";
  const played = statusType.completed || isLive;
  const dt = new Date(e.date);

  return {
    date: dt.toISOString().slice(0, 10),
    time: dt.toTimeString().slice(0, 5),
    round: "",
    status: statusType.shortDetail ?? statusType.detail ?? "",
    live: isLive,
    homeTeam: home?.team?.shortDisplayName ?? home?.team?.displayName ?? "?",
    awayTeam: away?.team?.shortDisplayName ?? away?.team?.displayName ?? "?",
    homeScore: played ? (home?.score ?? "-") : "",
    awayScore: played ? (away?.score ?? "-") : "",
  };
}

/** Full week of matches (past or upcoming) via ESPN — thesportsdb's free key only exposes a thin slice. */
async function fetchMatchesEspn(slug: string, from: Date, to: Date): Promise<any[]> {
  const data = await fetchJson(
    `${ESPN_SCOREBOARD_BASE}/${slug}/scoreboard?dates=${toYyyyMmDd(from)}-${toYyyyMmDd(to)}`,
  );
  return data.events ?? [];
}

export async function fetchResults(league: League): Promise<Match[]> {
  if (!league.espnSlug) return fetchResultsSportsDb(league.id);

  const to = new Date();
  const from = new Date(to.getTime() - 13 * DAY_MS);
  try {
    const events = await fetchMatchesEspn(league.espnSlug, from, to);
    return events
      .map(mapEspnEvent)
      .filter((m) => m.homeScore !== "" && !m.live)
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
      .slice(0, 20);
  } catch {
    return fetchResultsSportsDb(league.id);
  }
}

export async function fetchFixtures(league: League): Promise<Match[]> {
  if (!league.espnSlug) return fetchFixturesSportsDb(league.id);

  const from = new Date();
  const to = new Date(from.getTime() + 6 * DAY_MS);
  try {
    const events = await fetchMatchesEspn(league.espnSlug, from, to);
    return events
      .map(mapEspnEvent)
      .filter((m) => m.homeScore === "" || m.live)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
      .slice(0, 40);
  } catch {
    return fetchFixturesSportsDb(league.id);
  }
}

function statValue(stats: any[], name: string): string {
  return stats.find((s: any) => s.name === name)?.displayValue ?? "0";
}

/** Full standings (all teams) via ESPN's public scoreboard API — thesportsdb's free key caps tables at 5 rows. */
async function fetchStandingsEspn(slug: string): Promise<StandingRow[] | null> {
  const data = await fetchJson(`${ESPN_BASE}/${slug}/standings`);
  const groups = data.children;
  if (!groups || groups.length === 0) return null;

  const entries = groups.flatMap((g: any) => g.standings?.entries ?? []);
  if (entries.length === 0) return null;

  return entries
    .map((e: any) => {
      const stats = e.stats ?? [];
      return {
        rank: statValue(stats, "rank"),
        team: e.team?.shortDisplayName ?? e.team?.displayName ?? "?",
        played: statValue(stats, "gamesPlayed"),
        win: statValue(stats, "wins"),
        draw: statValue(stats, "ties"),
        loss: statValue(stats, "losses"),
        goalsFor: statValue(stats, "pointsFor"),
        goalsAgainst: statValue(stats, "pointsAgainst"),
        goalDiff: statValue(stats, "pointDifferential"),
        points: statValue(stats, "points"),
      };
    })
    .sort((a: StandingRow, b: StandingRow) => Number(a.rank) - Number(b.rank));
}

/** Returns null when no full table is available for this competition (e.g. cup / group+knockout format). */
export async function fetchStandings(league: League): Promise<StandingRow[] | null> {
  if (!league.espnSlug) return null;
  try {
    return await fetchStandingsEspn(league.espnSlug);
  } catch {
    return null;
  }
}

export function matchRow(
  id: string,
  match: Match,
  compact: boolean,
  index: number,
  rowHeight = 2,
) {
  const isLive = match.live;
  const score = match.homeScore !== "" ? `${match.homeScore}-${match.awayScore}` : match.time;
  const nameWidth = compact ? 10 : 18;
  const meta = compact ? "" : match.round ? `R${match.round}`.padEnd(4) : "".padEnd(4);

  return Box(
    {
      id,
      flexDirection: "row",
      height: rowHeight,
      alignItems: "center",
      paddingLeft: 1,
      backgroundColor: rowBg(index),
    },
    compact ? Text({ content: "" }) : Text({ content: meta, fg: theme.dim }),
    Text({
      content: shorten(match.homeTeam, nameWidth).padStart(nameWidth + 1),
      fg: theme.blue,
    }),
    Text({ content: score.padStart(7), fg: isLive ? theme.red : theme.yellow }),
    Text({ content: " " + shorten(match.awayTeam, nameWidth), fg: theme.blue }),
    isLive ? Text({ content: " ● " + match.status, fg: theme.red }) : Text({ content: "" }),
  );
}

export function standingRow(
  renderer: CliRenderer,
  id: string,
  row: StandingRow,
  isHeader: boolean,
  compact: boolean,
  index: number,
  rowHeight = 2,
) {
  const fg = isHeader ? theme.dim : theme.text;
  const rankFg = isHeader ? theme.dim : theme.yellow;
  const nameWidth = compact ? 13 : 22;

  const cells = [
    Text({ content: row.rank.padStart(3) + " ", fg: rankFg }),
    Text({ content: shorten(row.team, nameWidth).padEnd(nameWidth), fg: theme.blue }),
    Text({ content: row.played.padStart(3), fg }),
  ];

  if (!compact) {
    cells.push(
      Text({ content: row.win.padStart(3), fg }),
      Text({ content: row.draw.padStart(3), fg }),
      Text({ content: row.loss.padStart(3), fg }),
      Text({ content: row.goalsFor.padStart(4), fg }),
      Text({ content: row.goalsAgainst.padStart(4), fg }),
    );
  }

  cells.push(
    Text({ content: row.goalDiff.padStart(4), fg }),
    Text({ content: row.points.padStart(4), fg: isHeader ? theme.dim : theme.green }),
  );

  const box = ruledBox(renderer, id, {
    backgroundColor: isHeader ? theme.bg : rowBg(index),
    border: isHeader && rowHeight > 1 ? ["bottom"] : false,
    height: rowHeight,
  });
  cells.forEach((cell) => box.add(cell));
  return box;
}
