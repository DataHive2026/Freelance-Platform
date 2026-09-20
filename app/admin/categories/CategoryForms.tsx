"use client";

import { useActionState } from "react";
import { createCategoryAction, deleteCategoryAction, toggleCategoryAction, type CategoryActionState } from "./actions";

export function CreateCategoryForm() {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(createCategoryAction, {});

  return (
    <form action={formAction} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {state.error && <div style={{ color: "#B4432F", fontSize: 12 }}>{state.error}</div>}
      <input
        name="name"
        placeholder="New category name"
        required
        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#3454D1", color: "white", padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13 }}
      >
        {pending ? "Adding..." : "Add category"}
      </button>
    </form>
  );
}

export function CategoryRow({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(deleteCategoryAction, {});

  return (
    <div style={{ borderBottom: "1px solid #E2E4EA", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: isActive ? "#14171F" : "#9AA0AF" }}>{name}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <form action={toggleCategoryAction}>
            <input type="hidden" name="categoryId" value={id} />
            <button
              type="submit"
              style={{ fontSize: 12, color: isActive ? "#C97F1E" : "#3B8365", background: "none", border: "none", cursor: "pointer" }}
            >
              {isActive ? "Deactivate" : "Activate"}
            </button>
          </form>
          <form action={formAction}>
            <input type="hidden" name="categoryId" value={id} />
            <button type="submit" disabled={pending} style={{ fontSize: 12, color: "#B4432F", background: "none", border: "none", cursor: "pointer" }}>
              Delete
            </button>
          </form>
        </div>
      </div>
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginTop: 4 }}>{state.error}</div>}
    </div>
  );
}
