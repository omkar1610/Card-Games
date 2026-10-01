import { currentUser, setPassword, validPassword } from "@/lib/auth";
import { error, json, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return error("Not logged in", 401);
  const body = await readJson(req);
  if (!validPassword(body.next)) return error("New password must be at least 4 characters");
  await setPassword(me, body.next);
  return json({ ok: true });
}
