import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listUsers } from "@/lib/services/users";
import { UserRow } from "./UserRow";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "admin") redirect("/login");

  const { search } = await searchParams;
  const users = await listUsers(user.id, { search });

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <Link href="/admin/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to admin</Link>
      <h1 style={{ marginTop: 12 }}>Users</h1>
      <p style={{ color: "#5B6172", marginBottom: 16 }}>{users.length} matching.</p>

      <form method="GET" style={{ marginBottom: 20 }}>
        <input
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by email..."
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
      </form>

      <div>
        {users.length === 0 && <p style={{ color: "#9AA0AF", fontSize: 13 }}>No users found.</p>}
        {users.map((u) => {
          // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
          const displayName = u.client_profiles?.company_name ?? u.expert_profiles?.headline ?? u.email;
          return <UserRow key={u.id} id={u.id} email={u.email} userType={u.user_type} status={u.status} displayName={displayName} />;
        })}
      </div>
    </main>
  );
}
