# pi-tui

A terminal dashboard built for a Raspberry Pi touchscreen — Belgian football scores, world stock
markets, market news, your calendar, and weather, all in one touch-friendly TUI.

## Features

- **Home** — an overview dashboard: weather, next match, top gainer/loser, latest headlines, next calendar event
- **Football** — results, this week's fixtures, and full league tables for the Belgian Pro League, Challenger Pro League, Champions League, and the big 5 European leagues
- **Stocks** — world indices + a Big Tech watchlist, each with a live intraday chart, day-range gauge, and 1-month trend
- **News** — aggregated world market headlines, tap to read in-app
- **Calendar** — upcoming events from your own iCal feed, recurring events included
- Touch-first: tap navigation, swipe-to-scroll, drag a tab to split the screen into two side-by-side panels
- Price-move / kickoff / event alerts (in-app banner + desktop notification when available)

## Setup

Install dependencies:

```bash
bun install
```

Copy the example environment file and fill in your own values (see [Configuration](#configuration)):

```bash
cp .env.example .env
```

Run it:

```bash
bun dev
```

## Configuration

All personal settings live in `.env` (gitignored — never committed). See `.env.example` for the
full list with explanations. Currently configurable:

| Variable | Purpose | Default |
| --- | --- | --- |
| `CALENDAR_ICS_URL` | Your calendar's secret iCal feed URL | none (Calendar tab shows a setup message) |
| `WEATHER_CITY` | City for the Home tab's weather widget | `Brussels` |

To change the stock watchlist or the list of football leagues, edit `src/data/stocks.ts`
(`WATCHLIST`) or `src/data/football.ts` (`LEAGUES`) directly.

This project was created using `bun create tui`. [create-tui](https://git.new/create-tui) is the easiest way to get started with OpenTUI.
