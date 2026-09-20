"use client";

import { useActionState } from "react";
import { createProjectAction, type NewProjectState } from "./actions";

const initialState: NewProjectState = {};

export function NewProjectForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createProjectAction, initialState);

  return (
    <>
      {state.error && (
        <div style={{ background: "#FBEAE6", color: "#B4432F", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {state.error}
        </div>
      )}

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          name="title"
          placeholder="Project title"
          required
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E4EA" }}
        />
        <textarea
          name="description"
          placeholder="What outcome does this project need to deliver?"
          required
          rows={5}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E4EA", resize: "vertical" }}
        />
        <select
          name="categoryId"
          defaultValue=""
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E4EA" }}
        >
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            name="budgetMin"
            type="number"
            placeholder="Min budget (₹)"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E4EA", fontFamily: "monospace" }}
          />
          <input
            name="budgetMax"
            type="number"
            placeholder="Max budget (₹)"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E4EA", fontFamily: "monospace" }}
          />
        </div>
        <input
          name="deadline"
          type="date"
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E4EA", fontFamily: "monospace" }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#3454D1", color: "white", padding: "12px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
        >
          {pending ? "Creating..." : "Create project (as DRAFT)"}
        </button>
      </form>
    </>
  );
}
