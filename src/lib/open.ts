/** Opens a URL in the OS default browser — fire-and-forget, ignores failures. */
export function openUrl(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    // best-effort — nothing sensible to do if the OS can't open a browser
  }
}
