import { NextResponse } from "next/server";
import { RoomError } from "./rooms";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function handleError(e: unknown) {
  if (e instanceof RoomError) return error(e.message, e.status);
  console.error(e);
  return error("Server error", 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
