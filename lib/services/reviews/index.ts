import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";

export class ReviewServiceError extends Error {}

export interface SubmitReviewInput {
  projectId: string;
  revieweeUserId: string;
  qualityRating: number;
  communicationRating: number;
  reliabilityRating: number;
  technicalRating: number;
  collaborationRating: number;
  timelinessRating: number;
  comment?: string;
}

const RATING_FIELDS = [
  "qualityRating", "communicationRating", "reliabilityRating",
  "technicalRating", "collaborationRating", "timelinessRating",
] as const;

/**
 * Section 21: ratings aren't a single star value — six dimensions,
 * averaged into a cached overall_rating. Manipulation prevention is the
 * DB doing the real work here: reviews.unique(project_id, reviewer_id,
 * reviewee_id) from 0001_init.sql makes a duplicate review a constraint
 * violation, not something this service has to remember to check for.
 */
export async function submitReview(actorId: string, input: SubmitReviewInput) {
  for (const field of RATING_FIELDS) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new ReviewServiceError(`${field} must be an integer from 1 to 5`);
    }
  }
  if (actorId === input.revieweeUserId) {
    throw new ReviewServiceError("You can't review yourself");
  }

  const permitted = await can(actorId, "review:submit", input.projectId);
  if (!permitted) throw new ReviewServiceError("Reviews can only be submitted once a project is completed");

  const supabase = await createSupabaseServerClient();

  // Validate the reviewee is actually a legitimate party on THIS
  // project — the client, or an active team member — not an arbitrary
  // user id. AuthzService's scope check only establishes that the
  // ACTOR belongs to the project; it says nothing about who they're
  // trying to review, which is a business rule, not an authz one.
  const isValidReviewee = await isPartyOnProject(supabase, input.projectId, input.revieweeUserId);
  if (!isValidReviewee) {
    throw new ReviewServiceError("That person isn't a client or team member on this project");
  }

  const overall = Math.round(
    (RATING_FIELDS.reduce((sum, f) => sum + input[f], 0) / RATING_FIELDS.length) * 100
  ) / 100;

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      project_id: input.projectId,
      reviewer_id: actorId,
      reviewee_id: input.revieweeUserId,
      quality_rating: input.qualityRating,
      communication_rating: input.communicationRating,
      reliability_rating: input.reliabilityRating,
      technical_rating: input.technicalRating,
      collaboration_rating: input.collaborationRating,
      timeliness_rating: input.timelinessRating,
      overall_rating: overall,
      comment: input.comment,
    })
    .select()
    .single();

  if (error) {
    // Postgres unique_violation — surface it as the specific, expected
    // case it is, not a generic database error.
    if (error.code === "23505") {
      throw new ReviewServiceError("You've already reviewed this person for this project");
    }
    throw new ReviewServiceError(error.message);
  }

  await recomputeExpertRatingCache(supabase, input.revieweeUserId);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "review.submitted",
    entity_type: "review",
    entity_id: data.id,
    metadata: { project_id: input.projectId, reviewee_id: input.revieweeUserId },
  });

  return data;
}

async function isPartyOnProject(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  userId: string
): Promise<boolean> {
  const { data: project } = await supabase
    .from("projects")
    .select("client_profiles(user_id)")
    .eq("id", projectId)
    .single();
  // @ts-expect-error — joined-table typing gap, same as elsewhere in the codebase
  if (project?.client_profiles?.user_id === userId) return true;

  const { data: team } = await supabase.from("project_teams").select("id").eq("project_id", projectId).maybeSingle();
  if (!team) return false;

  const { data: members } = await supabase
    .from("team_members")
    .select("expert_profiles(user_id)")
    .eq("project_team_id", team.id)
    .eq("status", "active");

  return (members ?? []).some((m) =>
    // @ts-expect-error — see above
    m.expert_profiles?.user_id === userId
  );
}

/**
 * expert_profiles.avg_rating and total_projects_completed are cached
 * columns (Phase 0's schema comment: "cached, recomputed by
 * ReviewService") — this is that recomputation. Only runs for
 * reviewees who are experts; a review of a client doesn't touch this
 * (clients don't have an equivalent cached-rating column in the current
 * schema — flagged as a gap below).
 */
async function recomputeExpertRatingCache(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, revieweeUserId: string) {
  const { data: expertProfile } = await supabase.from("expert_profiles").select("id").eq("user_id", revieweeUserId).maybeSingle();
  if (!expertProfile) return; // reviewee is a client, not an expert — nothing cached to update

  const { data: reviews } = await supabase.from("reviews").select("overall_rating").eq("reviewee_id", revieweeUserId);
  if (!reviews || reviews.length === 0) return;

  const avg = reviews.reduce((sum, r) => sum + Number(r.overall_rating), 0) / reviews.length;

  const { count } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("expert_id", expertProfile.id)
    .eq("status", "completed");

  await supabase
    .from("expert_profiles")
    .update({ avg_rating: Math.round(avg * 100) / 100, total_projects_completed: count ?? 0 })
    .eq("id", expertProfile.id);
}

export async function getProjectClientUser(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("projects")
    .select("client_profiles(user_id, company_name)")
    .eq("id", projectId)
    .single();

  if (!data?.client_profiles) return null;
  // @ts-expect-error — joined-table typing gap, same as elsewhere in the codebase
  return { userId: data.client_profiles.user_id as string, name: data.client_profiles.company_name as string };
}

export async function listForUser(revieweeUserId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, quality_rating, communication_rating, reliability_rating, technical_rating, collaboration_rating, timeliness_rating, overall_rating, comment, created_at, projects(title), users!reviews_reviewer_id_fkey(email)")
    .eq("reviewee_id", revieweeUserId)
    .order("created_at", { ascending: false });

  if (error) throw new ReviewServiceError(error.message);
  return data;
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "project:view", projectId);
  if (!permitted) throw new ReviewServiceError("Not authorized to view this project's reviews");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, reviewer_id, reviewee_id, overall_rating, comment, created_at")
    .eq("project_id", projectId);

  if (error) throw new ReviewServiceError(error.message);
  return data;
}

export async function removeReview(actorId: string, reviewId: string) {
  const permitted = await can(actorId, "review:remove"); // scope "none" — reviewId isn't part of the authz decision, only role matters
  if (!permitted) throw new ReviewServiceError("Not authorized to remove reviews");

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase.from("reviews").select("reviewee_id").eq("id", reviewId).single();

  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw new ReviewServiceError(error.message);

  if (review) await recomputeExpertRatingCache(supabase, review.reviewee_id);
}
