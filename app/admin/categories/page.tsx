import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listCategories } from "@/lib/services/categories";
import { CreateCategoryForm, CategoryRow } from "./CategoryForms";

export default async function AdminCategoriesPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "admin") redirect("/login");

  const categories = await listCategories();

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 560 }}>
      <Link href="/admin/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to admin</Link>
      <h1 style={{ marginTop: 12 }}>Categories</h1>
      <p style={{ color: "#5B6172", marginBottom: 20 }}>Inactive categories stop appearing when clients post new projects, but existing projects keep working.</p>

      <CreateCategoryForm />

      <div>
        {categories.length === 0 && <p style={{ color: "#9AA0AF", fontSize: 13 }}>No categories yet.</p>}
        {categories.map((c) => (
          <CategoryRow key={c.id} id={c.id} name={c.name} isActive={c.is_active} />
        ))}
      </div>
    </main>
  );
}
