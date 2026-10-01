import { currentUser } from "@/lib/auth";
import { error, handleError, json } from "@/lib/http";
import { createRoom } from "@/lib/rooms";

export async function POST() {
  const me = await currentUser();
  if (!me) return error("Not logged in", 401);
  try {
    return json({ code: await createRoom(me) });
  } catch (e) {
    return handleError(e);
  }
}
