import { currentUser, endSession } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { leaveLobbyFor } from "@/lib/rooms";

export async function POST() {
  const me = await currentUser();
  try {
    if (me) await leaveLobbyFor(me);
  } catch (e) {
    return handleError(e);
  }
  await endSession(me);
  return json({ ok: true });
}
