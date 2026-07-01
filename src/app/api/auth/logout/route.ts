import { createServerSupabase } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function POST() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();

  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3060";
  const protocol = host.startsWith("localhost") ? "http" : "https";

  return NextResponse.redirect(new URL("/login", `${protocol}://${host}`), {
    status: 302,
  });
}

