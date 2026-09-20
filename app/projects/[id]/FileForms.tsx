"use client";

import { useState, useRef } from "react";
import {
  createUploadUrlServerAction, confirmUploadServerAction,
  getDownloadUrlServerAction, deleteFileServerAction,
} from "./actions";

const CATEGORIES = ["requirements", "dataset", "documents", "code", "deliverables", "reports", "meeting_docs", "other"];

export function UploadFileForm({ projectId }: { projectId: string }) {
  const [category, setCategory] = useState("documents");
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setStatus("uploading");
    setError("");

    // Step 1: get a signed upload URL (runs AuthzService.can() server-side).
    const prep = await createUploadUrlServerAction(projectId, file.name, category);
    if (prep.error || !prep.data) {
      setError(prep.error ?? "Failed to prepare upload");
      setStatus("error");
      return;
    }

    // Step 2: PUT the actual bytes straight to Storage — never through
    // the Server Action, which would base64-bloat them through the
    // request body.
    const putRes = await fetch(prep.data.signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) {
      setError("Upload to storage failed");
      setStatus("error");
      return;
    }

    // Step 3: record the files row now that the bytes are actually there.
    const confirm = await confirmUploadServerAction({
      projectId,
      storagePath: prep.data.storagePath,
      fileName: file.name,
      category,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (confirm.error) {
      setError(confirm.error);
      setStatus("error");
      return;
    }

    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 8, padding: 12, background: "#F2F3F6", borderRadius: 10 }}>
      {error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid #E2E4EA" }}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          ref={inputRef}
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
          disabled={status === "uploading"}
          style={{ fontSize: 12 }}
        />
        {status === "uploading" && <span style={{ fontSize: 12, color: "#5B6172" }}>Uploading...</span>}
      </div>
    </div>
  );
}

export function FileRow({ id, fileName, category, projectId }: { id: string; fileName: string; category: string; projectId: string }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    const result = await getDownloadUrlServerAction(id);
    setBusy(false);
    if (result.url) window.open(result.url, "_blank");
  };

  const remove = async () => {
    if (!confirm(`Delete ${fileName}?`)) return;
    setBusy(true);
    await deleteFileServerAction(id, projectId);
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #E2E4EA" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{fileName}</div>
        <div style={{ fontSize: 11, color: "#9AA0AF", textTransform: "uppercase" }}>{category}</div>
      </div>
      <button onClick={download} disabled={busy} style={{ fontSize: 12, color: "#3454D1", background: "none", border: "none", cursor: "pointer" }}>
        Download
      </button>
      <button onClick={remove} disabled={busy} style={{ fontSize: 12, color: "#B4432F", background: "none", border: "none", cursor: "pointer" }}>
        Delete
      </button>
    </div>
  );
}
