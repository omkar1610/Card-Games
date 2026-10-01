import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { normalizeCode } from "@/lib/rooms";
import RoomClient from "@/components/RoomClient";
import Heartbeat from "@/components/Heartbeat";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code);
  if (!(await currentUser())) redirect(`/login?next=/room/${code}`);
  return (
    <>
      <Heartbeat />
      <RoomClient code={code} />
    </>
  );
}
