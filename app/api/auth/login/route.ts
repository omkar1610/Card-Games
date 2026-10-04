import { setupProblem, checkPassword, cleanDisplayName, createUser, setDisplayName, isOnline, logoutEverywhere, normalizeUsername, startSession, validPassword } from "@/lib/auth";
import { error, json, readJson } from "@/lib/http";
import { roomFor } from "@/lib/rooms";

// New username → account is created. Existing username → password must match, and the account
// must not be in use (open on another device or seated in a room) unless `force` is set, which
// logs out every other session first and keeps the player's seat.
export async function POST(req: Request) {
  const problem = setupProblem();
  if (problem) return error(problem, 500);
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  if (!username) return error("Username must be 3–20 letters, numbers or _");
  if (!validPassword(body.password)) return error("Password must be at least 4 characters");

  const shown = cleanDisplayName(body.username) ?? username;
  if (!(await createUser(username, body.password, shown))) {
    if (!(await checkPassword(username, body.password))) return error("Wrong password", 401);
    if (body.force === true) {
      await logoutEverywhere(username);
    } else {
      if (await isOnline(username)) return error(`${username} is already logged in on another device`, 409);
      const room = await roomFor(username);
      if (room) return error(`${username} is already in room ${room}`, 409);
    }
  }
  // Logins are case-insensitive. The name is shown as typed at sign-up; a later login typed with
  // capitals ("Jack") updates it, but an all-lowercase login doesn't undo the capitals.
  if (shown !== username) await setDisplayName(username, shown);
  await startSession(username);
  return json({ username });
}
