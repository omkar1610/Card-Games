import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Index() {
  redirect((await currentUser()) ? "/home" : "/login");
}
