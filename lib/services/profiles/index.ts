import { createSupabaseServerClient } from "@/lib/supabase/server";

export class ProfileServiceError extends Error {}

/**
 * Resolves the client_profiles row belonging to the signed-in user.
 * Every write in this file is implicitly scoped to "your own profile" —
 * there's no path here that takes an arbitrary client_id, so there's
 * nothing for AuthzService to gate: you can only ever touch your own row.
 */
export async function getMyClientProfile(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw new ProfileServiceError(error.message);
  return data;
}

export async function updateClientProfile(
  userId: string,
  input: Partial<{
    companyName: string;
    companySize: string;
    industry: string;
    website: string;
  }>
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_profiles")
    .update({
      company_name: input.companyName,
      company_size: input.companySize,
      industry: input.industry,
      website: input.website,
    })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new ProfileServiceError(error.message);
  return data;
}

export async function getMyExpertProfile(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expert_profiles")
    .select("*, expert_skills(skill_id, proficiency_level, skills(name))")
    .eq("user_id", userId)
    .single();

  if (error) throw new ProfileServiceError(error.message);
  return data;
}

export async function updateExpertProfile(
  userId: string,
  input: Partial<{
    headline: string;
    bio: string;
    hourlyRate: number;
    availabilityStatus: "available" | "busy" | "unavailable";
  }>
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expert_profiles")
    .update({
      headline: input.headline,
      bio: input.bio,
      hourly_rate: input.hourlyRate,
      availability_status: input.availabilityStatus,
    })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new ProfileServiceError(error.message);
  return data;
}
