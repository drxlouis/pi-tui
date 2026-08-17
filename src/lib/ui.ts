import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
  type MouseEvent,
  type ScrollBoxRenderable,
} from "@opentui/core";
import theme from "../theme";

/**
 * Makes a ScrollBox pannable by touch/mouse drag, not just the scroll wheel — plain touch
 * panels report finger movement as mouse "drag" events (via SGR any-motion tracking), which
 * ScrollBoxRenderable's built-in handling doesn't turn into panning on its own.
 */
export function enableTouchScroll(scrollBox: ScrollBoxRenderable) {
  let startY: number | null = null;
  let startTop = 0;
  scrollBox.onMouseDown = (e: MouseEvent) => {
    startY = e.y;
    startTop = scrollBox.scrollTop;
  };
  scrollBox.onMouseDrag = (e: MouseEvent) => {
    if (startY === null) return;
    scrollBox.scrollTop = startTop - (e.y - startY);
  };
  scrollBox.onMouseUp = () => {
    startY = null;
  };
}

export function shorten(name: string, max: number): string {
  return name.length > max ? name.slice(0, max - 1) + "." : name;
}

export function rowBg(index: number) {
  return index % 2 === 0 ? theme.bg : theme.bgRowAlt;
}

/**
 * Tappable button sized for finger touch, not just mouse click.
 *
 * When `onDragRelease` is given, the button also supports drag: a press that moves more than
 * a few cells before release calls `onDragRelease(finalX)` instead of `onTap()` — used for
 * "drag a tab out to split the screen". Buttons that don't need this behave exactly as before
 * (tap fires immediately on mouse-down), so this never changes existing call sites.
 */
export function button(
  renderer: CliRenderer,
  id: string,
  label: string,
  active: boolean,
  onTap: () => void,
  flexGrow = 0,
  height = 3,
  onDragRelease?: (finalX: number) => void,
) {
  const box = new BoxRenderable(renderer, {
    id,
    paddingLeft: 1,
    paddingRight: 1,
    height,
    flexGrow,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: active ? theme.bgPanel : theme.bg,
    borderColor: theme.borderActive,
  });

  if (onDragRelease) {
    let downX = 0;
    let dragged = false;
    const DRAG_THRESHOLD = 4;
    box.onMouseDown = (e: MouseEvent) => {
      downX = e.x;
      dragged = false;
    };
    box.onMouseDrag = (e: MouseEvent) => {
      if (Math.abs(e.x - downX) > DRAG_THRESHOLD) dragged = true;
    };
    box.onMouseUp = (e: MouseEvent) => {
      if (dragged) onDragRelease(e.x);
      else onTap();
    };
  } else {
    box.onMouseDown = (_e: MouseEvent) => onTap();
  }

  box.border = active ? ["bottom"] : false;
  box.add(
    new TextRenderable(renderer, {
      content: label,
      fg: active ? theme.accent : theme.dim,
      attributes: active ? TextAttributes.BOLD : undefined,
    }),
  );
  return box;
}

/**
 * The functional Box() composition helper renders a full box outline whenever `borderColor`
 * is set, even with `border: false` — so any row needing a partial divider is built as a raw
 * BoxRenderable with `.border` assigned after construction instead.
 */
export function ruledBox(
  renderer: CliRenderer,
  id: string,
  opts: {
    backgroundColor: string;
    border: false | ("top" | "bottom")[];
    height?: number;
    onMouseDown?: () => void;
  },
) {
  const box = new BoxRenderable(renderer, {
    id,
    flexDirection: "row",
    height: opts.height ?? 2,
    alignItems: "center",
    paddingLeft: 1,
    backgroundColor: opts.backgroundColor,
    borderColor: theme.border,
    onMouseDown: opts.onMouseDown ? () => opts.onMouseDown!() : undefined,
  });
  box.border = opts.border;
  return box;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Vandaag · Maandag 17 augustus"-style label for a "YYYY-MM-DD" date string. */
export function dayHeaderLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / DAY_MS);

  const weekday = date.toLocaleDateString("nl-BE", { weekday: "long" });
  const rest = date.toLocaleDateString("nl-BE", { day: "numeric", month: "long" });
  const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${rest}`;

  if (diffDays === 0) return `Vandaag · ${label}`;
  if (diffDays === 1) return `Morgen · ${label}`;
  if (diffDays === -1) return `Gisteren · ${label}`;
  return label;
}

export function dayHeaderRow(renderer: CliRenderer, id: string, dateStr: string, height = 2) {
  const box = ruledBox(renderer, id, {
    backgroundColor: theme.bg,
    border: height > 1 ? ["top"] : false,
    height,
  });
  box.add(
    new TextRenderable(renderer, {
      content: dayHeaderLabel(dateStr),
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    }),
  );
  return box;
}

export function emptyMessage(renderer: CliRenderer, id: string, message: string) {
  return new TextRenderable(renderer, { id, content: message, fg: theme.red, paddingLeft: 1 });
}

/** Generic labeled section divider (e.g. group headers in the stocks watchlist). */
export function sectionHeaderRow(renderer: CliRenderer, id: string, label: string, height = 2) {
  const box = ruledBox(renderer, id, {
    backgroundColor: theme.bg,
    border: height > 1 ? ["top"] : false,
    height,
  });
  box.add(
    new TextRenderable(renderer, {
      content: label,
      fg: theme.accent,
      attributes: TextAttributes.BOLD,
    }),
  );
  return box;
}

const SPARK_LEVELS = "▁▂▃▄▅▆▇█";

/** Renders a numeric series as a compact Unicode sparkline, downsampled to `width` points. */
export function sparkline(values: number[], width: number): string {
  if (values.length === 0) return " ".repeat(width);

  const sampled: number[] =
    values.length <= width
      ? values
      : Array.from({ length: width }, (_, i) => values[Math.floor((i * values.length) / width)]!);

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min;

  return sampled
    .map((v) => {
      const level = span > 0 ? Math.round(((v - min) / span) * (SPARK_LEVELS.length - 1)) : 4;
      return SPARK_LEVELS[level];
    })
    .join("");
}

/**
 * Renders a numeric series as a multi-row block chart (like a mini candlestick-less line
 * chart), `height` rows tall and `width` columns wide, using eighth-block characters for
 * sub-row precision. Returns the rows top-to-bottom.
 */
export function verticalChart(values: number[], width: number, height: number): string[] {
  if (values.length === 0) return Array.from({ length: height }, () => " ".repeat(width));

  const sampled: number[] =
    values.length <= width
      ? values
      : Array.from({ length: width }, (_, i) => values[Math.floor((i * values.length) / width)]!);

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min;
  const maxEighths = height * 8;

  const columnEighths = sampled.map((v) =>
    span > 0 ? Math.round(((v - min) / span) * maxEighths) : Math.round(maxEighths / 2),
  );

  const rows: string[] = [];
  for (let row = 0; row < height; row++) {
    const rowFromBottom = height - 1 - row;
    let line = "";
    for (const eighths of columnEighths) {
      const filled = Math.max(0, Math.min(8, eighths - rowFromBottom * 8));
      line += filled === 0 ? " " : filled === 8 ? "█" : SPARK_LEVELS[filled - 1];
    }
    rows.push(line);
  }
  return rows;
}
