import { redirect } from "next/navigation";
import { DEFAULT_PASSWORD, checkPassword, currentUser, getDisplayName } from "@/lib/auth";
import { roomFor } from "@/lib/rooms";
import Home from "@/components/Home";
import Heartbeat from "@/components/Heartbeat";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  const [isDefault, room, shown] = await Promise.all([
    checkPassword(me, DEFAULT_PASSWORD),
    roomFor(me),
    getDisplayName(me),
  ]);
  return (
    <main className="center-page">
      <Heartbeat />
      <Home username={shown} defaultPassword={isDefault} currentRoom={room} />
    </main>
  );
}
