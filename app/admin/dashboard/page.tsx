import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser, signOut } from "@/lib/services/auth";

export default async function AdminDashboardPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "admin") redirect("/login");

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <p style={{ color: "#5B6172", margin: "4px 0 0" }}>{user.email}</p>
        </div>
        <form action={async () => { "use server"; await signOut(); redirect("/login"); }}>
          <button type="submit" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E2E4EA", background: "white" }}>Sign out</button>
        </form>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link
          href="/admin/users"
          style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, textDecoration: "none", color: "inherit" }}
        >
          <div style={{ fontWeight: 600 }}>Users</div>
          <div style={{ fontSize: 13, color: "#5B6172" }}>Search, suspend, and restore accounts.</div>
        </Link>

        <Link
          href="/admin/disputes"
          style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, textDecoration: "none", color: "inherit" }}
        >
          <div style={{ fontWeight: 600 }}>Disputes</div>
          <div style={{ fontSize: 13, color: "#5B6172" }}>Review and resolve disputed projects.</div>
        </Link>

        <Link
          href="/admin/categories"
          style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, textDecoration: "none", color: "inherit" }}
        >
          <div style={{ fontWeight: 600 }}>Categories</div>
          <div style={{ fontSize: 13, color: "#5B6172" }}>The platform taxonomy projects are posted under.</div>
        </Link>

        <Link
          href="/admin/commission"
          style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, textDecoration: "none", color: "inherit" }}
        >
          <div style={{ fontWeight: 600 }}>Commission rules</div>
          <div style={{ fontSize: 13, color: "#5B6172" }}>The rates PaymentService actually charges at funding time.</div>
        </Link>
      </div>
    </main>
  );
}
