import { currentUser } from "@/lib/auth";
import { error, handleError, json, readJson } from "@/lib/http";
import { isGameId } from "@/lib/games/catalog";
import { createRoom } from "@/lib/rooms";

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return error("Not logged in", 401);
  const body = await readJson(req);
  const game = body.game === undefined ? undefined : isGameId(body.game) ? body.game : null;
  if (game === null) return error("Unknown game");
  try {
    return json({ code: await createRoom(me, game) });
  } catch (e) {
    return handleError(e);
  }
}
