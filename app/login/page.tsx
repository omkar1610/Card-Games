import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  if (await currentUser()) redirect(safeNext);
  return (
    <main className="center-page">
      <LoginForm next={safeNext} />
    </main>
  );
}
