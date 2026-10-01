import { currentUser, markPresent } from "@/lib/auth";
import { error, json } from "@/lib/http";

export async function POST() {
  const me = await currentUser();
  if (!me) return error("Not logged in", 401);
  await markPresent(me);
  return json({ ok: true });
}
