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

## macOS app

Prefer a double-clickable app over the command line? Build one:

```bash
bash scripts/build-mac-app.sh
```

This produces `dist/PiTUI.app` (universal binary, arm64 + x64) and a zipped
`dist/PiTUI-<version>-macOS.zip` ready to share. Double-clicking the app opens a Terminal window
running the dashboard.

Since the app isn't notarized by Apple, macOS will flag it as being from an "unidentified
developer" the first time it's opened after downloading. To run it anyway: right-click the app →
**Open** → **Open** again in the dialog that appears. This is only needed once.

## Linux (including Raspberry Pi)

```bash
bash scripts/build-linux.sh
```

Produces `dist/pi-tui-<version>-linux-arm64.tar.gz` (Raspberry Pi OS 64-bit and other ARM64
Linux) and `dist/pi-tui-<version>-linux-x64.tar.gz` (regular 64-bit Linux PCs). Each tarball is
self-contained — extract it and run:

```bash
./pi-tui                       # run directly in your current terminal
./run-in-terminal.sh           # open in a new terminal window, for double-clicking
./install-desktop-entry.sh     # add a PiTUI entry to your applications menu
./install-desktop-entry.sh --autostart   # ...and launch it automatically on login (kiosk setups)
```

Requires a 64-bit OS (bun doesn't support 32-bit ARM, so older Pi Zero/2 boards on the 32-bit
image aren't supported — use Raspberry Pi OS 64-bit).

### Linux desktop environment (kiosk setup)

If you're on a minimal/headless Debian install (no desktop yet — you'll know because the
touchscreen just shows a text `login:` prompt), here's the full path to a working touchscreen
kiosk that auto-boots straight into the dashboard, fullscreen. This was worked out the hard way
on a Raspberry Pi 5 running plain Debian 13 with a generic HDMI touchscreen — your mileage may
vary slightly on Raspberry Pi OS or other hardware, but the gotchas below are worth checking
either way.

1. **Install a lightweight desktop.** `lxde-core` alone is *not* enough — it has no default
   theme, wallpaper, or menu, which on some setups renders as a plain black screen with nothing
   visible but the mouse cursor. Install `lxde-common` too:

   ```bash
   sudo apt update
   sudo apt install --no-install-recommends xserver-xorg lightdm lxde-core lxde-common lxappearance lxterminal xfonts-base xdotool -y
   ```

   (`xfonts-base` is easy to miss and non-obvious: without it, `lxterminal` crashes on launch
   with `No suitable files for '9x18' found!` — a missing legacy X bitmap font. `xdotool` is
   only needed for the auto-fullscreen trick below.)

2. **On a Raspberry Pi 5**, if the screen stays black even with `lxde-common` installed and
   `Xorg`/`lightdm` show as running fine, check `sudo tail -60 /var/log/Xorg.0.log` for:
   `Cannot run in framebuffer mode. Please specify busIDs for all framebuffer devices`. The Pi 5
   exposes two DRM devices (`card0` = the V3D GPU core, `card1` = the actual vc4 display
   controller) and Xorg's autodetection can pick the wrong one. Force it explicitly:

   ```bash
   sudo mkdir -p /etc/X11/xorg.conf.d
   sudo tee /etc/X11/xorg.conf.d/10-vc4.conf > /dev/null <<'EOF'
   Section "Device"
       Identifier "Vc4"
       Driver "modesetting"
       Option "kmsdev" "/dev/dri/card1"
   EndSection
   EOF
   sudo systemctl restart lightdm
   ```

3. **Auto-login** so it boots straight to the desktop without a login screen:

   ```bash
   sudo mkdir -p /etc/lightdm/lightdm.conf.d
   sudo tee /etc/lightdm/lightdm.conf.d/50-autologin.conf > /dev/null <<'EOF'
   [Seat:*]
   autologin-user=YOUR_USERNAME
   autologin-user-timeout=0
   autologin-session=LXDE
   EOF
   sudo systemctl set-default graphical.target
   ```

4. **Install the app with autostart** (see the extracted tarball's own scripts):

   ```bash
   ./install-desktop-entry.sh --autostart
   ```

   This writes both an XDG `~/.config/autostart/*.desktop` entry *and* a
   `~/.config/lxsession/LXDE/autostart` entry — in practice, `lxsession` didn't reliably pick up
   the XDG one, so the LXDE-native file (with its required `@` prefix, which also means "relaunch
   if it exits" — handy for a kiosk) is what actually makes autostart work.

5. `reboot`. It should boot straight into a fullscreen terminal running the dashboard. If the
   window opens but isn't fullscreen, that means `xdotool` wasn't installed before running
   `install-desktop-entry.sh` — install it and re-run `run-in-terminal.sh` (or reboot again).

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
