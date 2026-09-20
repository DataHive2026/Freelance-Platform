import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { can } from "@/lib/services/authz";

export class FileServiceError extends Error {}

const BUCKET = "project-files";

export interface CreateUploadUrlInput {
  projectId: string;
  fileName: string;
  category:
    | "requirements" | "dataset" | "documents" | "code"
    | "deliverables" | "reports" | "meeting_docs" | "other";
}

/**
 * Step 1 of upload: authorize, then hand back a signed URL the BROWSER
 * uploads directly to — the file's bytes never pass through a Server
 * Action (which would base64-bloat them through the request body and
 * hit Next.js's body-size limits on anything non-trivial). The server
 * never sees the file content, only records metadata once the browser
 * confirms the upload succeeded (confirmUpload, below).
 */
export async function createUploadUrl(actorId: string, input: CreateUploadUrlInput) {
  const permitted = await can(actorId, "file:upload", input.projectId);
  if (!permitted) throw new FileServiceError("Not authorized to upload files to this project");

  // Path includes a random segment so two people uploading a file with
  // the same name don't collide — the display name (input.fileName) is
  // stored separately in the files.file_name column, not derived from
  // this path.
  const storagePath = `${input.projectId}/${crypto.randomUUID()}-${input.fileName}`;

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new FileServiceError(error.message);

  return { storagePath, signedUrl: data.signedUrl, token: data.token };
}

export interface ConfirmUploadInput {
  projectId: string;
  storagePath: string;
  fileName: string;
  category: CreateUploadUrlInput["category"];
  mimeType?: string;
  sizeBytes?: number;
}

/**
 * Step 2: the browser calls this after the direct-to-Storage PUT
 * succeeds, to record the files row. Re-checks authorization rather
 * than trusting that createUploadUrl's earlier check still holds —
 * cheap insurance against a stale signed URL being reused by a caller
 * who's since lost access (e.g. was removed from the team).
 */
export async function confirmUpload(actorId: string, input: ConfirmUploadInput) {
  const permitted = await can(actorId, "file:upload", input.projectId);
  if (!permitted) throw new FileServiceError("Not authorized to upload files to this project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("files")
    .insert({
      project_id: input.projectId,
      uploaded_by: actorId,
      category: input.category,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select()
    .single();
  if (error) throw new FileServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "file.uploaded",
    entity_type: "file",
    entity_id: data.id,
    metadata: { project_id: input.projectId, file_name: input.fileName },
  });

  return data;
}

/**
 * A short-lived (60s) signed GET URL — the file is never made public,
 * and a new URL has to be requested (re-running the authz check) every
 * time someone wants to download it. This is the concrete implementation
 * of "a user should never be able to access files belonging to projects
 * they are not authorized to access" from the original spec's Section 10.
 */
export async function getDownloadUrl(actorId: string, fileId: string) {
  const permitted = await can(actorId, "file:download", fileId);
  if (!permitted) throw new FileServiceError("Not authorized to download this file");

  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase.from("files").select("storage_path, file_name").eq("id", fileId).single();
  if (!file) throw new FileServiceError("File not found");

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.storage.from(BUCKET).createSignedUrl(file.storage_path, 60);
  if (error) throw new FileServiceError(error.message);

  return { url: data.signedUrl, fileName: file.file_name };
}

export async function deleteFile(actorId: string, fileId: string) {
  const permitted = await can(actorId, "file:delete", fileId);
  if (!permitted) throw new FileServiceError("Not authorized to delete this file");

  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase.from("files").select("storage_path").eq("id", fileId).single();
  if (!file) throw new FileServiceError("File not found");

  const service = createSupabaseServiceRoleClient();
  const { error: storageError } = await service.storage.from(BUCKET).remove([file.storage_path]);
  if (storageError) throw new FileServiceError(storageError.message);

  const { error } = await supabase.from("files").delete().eq("id", fileId);
  if (error) throw new FileServiceError(error.message);
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "file:download", projectId); // scope check only — resolves via the plain project branch
  if (!permitted) throw new FileServiceError("Not authorized to view this project's files");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("files")
    .select("id, file_name, category, size_bytes, mime_type, created_at, uploaded_by, users(email)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new FileServiceError(error.message);
  return data;
}
