import { currentUser } from "@/lib/auth";
import { error, handleError, json, readJson } from "@/lib/http";
import { RoomOp, getRoomView, normalizeCode, updateRoom } from "@/lib/rooms";

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

// Polled by the table every second. `?v=` is the version the client has; we reply 204 if unchanged.
export async function GET(req: Request, { params }: Ctx) {
  const me = await currentUser({ verify: false });
  if (!me) return error("Not logged in", 401);
  const code = normalizeCode((await params).code);
  const v = new URL(req.url).searchParams.get("v");
  try {
    const view = await getRoomView(code, me, v ? Number(v) : undefined);
    return view ? json(view) : new Response(null, { status: 204 });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const me = await currentUser();
  if (!me) return error("Not logged in", 401);
  const code = normalizeCode((await params).code);
  try {
    return json(await updateRoom(code, me, (await readJson(req)) as RoomOp));
  } catch (e) {
    return handleError(e);
  }
}
