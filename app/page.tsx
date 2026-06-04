import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getServerSupabase();

  const { data: recentTrace } = await supabase
    .from("traces")
    .select("agent")
    .order("created_at", { ascending: false })
    .limit(1);

  if (recentTrace && recentTrace.length > 0) {
    redirect(`/${recentTrace[0].agent}/traces`);
  }

  redirect("/all/traces");
}
