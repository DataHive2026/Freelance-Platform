import Link from "next/link";
import { brand } from "@/lib/config/brand";

export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>{brand.name}</h1>
      <p>{brand.tagline}</p>
      <p style={{ margin: "16px 0", color: "#5B6172" }}>
        Phase 1 + Phase 2 scaffold — real Supabase Auth wired to real Server
        Actions. See /database/migrations, /lib/services, /app/(auth).
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/login" style={{ color: "#3454D1" }}>Sign in</Link>
        <Link href="/signup" style={{ color: "#3454D1" }}>Sign up</Link>
      </div>
    </main>
  );
}
