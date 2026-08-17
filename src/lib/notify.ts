/** Best-effort OS desktop notification — silently does nothing if unsupported (e.g. headless Pi). */
export function notifyOS(title: string, message: string): void {
  try {
    if (process.platform === "darwin") {
      const escape = (s: string) => s.replace(/"/g, '\\"');
      Bun.spawn(
        ["osascript", "-e", `display notification "${escape(message)}" with title "${escape(title)}"`],
        { stdout: "ignore", stderr: "ignore" },
      );
    } else if (process.platform === "linux") {
      Bun.spawn(["notify-send", title, message], { stdout: "ignore", stderr: "ignore" });
    }
  } catch {
    // best-effort — no desktop notification daemon available, that's fine
  }
}
