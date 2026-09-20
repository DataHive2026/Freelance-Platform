import Link from "next/link";
import { listCategories } from "@/lib/services/categories";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const categories = await listCategories();

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 560 }}>
      <Link href="/client/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to dashboard</Link>
      <h1 style={{ marginTop: 12 }}>Post a project</h1>
      <p style={{ color: "#5B6172" }}>This goes straight into the database via ProjectService.createProject().</p>

      <NewProjectForm categories={categories.filter((c) => c.is_active)} />
    </main>
  );
}
