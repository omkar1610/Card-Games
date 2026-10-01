import { setupProblem, DEFAULT_PASSWORD, isOnline, normalizeUsername, setPassword, userExists } from "@/lib/auth";
import { error, json, readJson } from "@/lib/http";
import { roomFor } from "@/lib/rooms";

// Resets a forgotten password to the default. Not allowed while the account is in use,
// so nobody can take over someone's seat.
export async function POST(req: Request) {
  const problem = setupProblem();
  if (problem) return error(problem, 500);
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  if (!username || !(await userExists(username))) return error("No account with that username", 404);
  if (await isOnline(username)) return error(`${username} is logged in right now, so the password can't be reset`, 409);
  const room = await roomFor(username);
  if (room) return error(`${username} is playing in room ${room}, so the password can't be reset`, 409);
  await setPassword(username, DEFAULT_PASSWORD);
  return json({ ok: true });
}
