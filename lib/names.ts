/** Seat values are usernames, or "bot:Name" for bots. */
export function displayName(u: string | null | undefined): string {
  if (!u) return "?";
  return u.startsWith("bot:") ? `🤖 ${u.slice(4)}` : u;
}
