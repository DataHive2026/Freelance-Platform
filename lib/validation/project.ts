import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(5, "Title needs at least 5 characters").max(160),
  description: z.string().min(20, "Give a bit more detail on what this project needs"),
  categoryId: z.string().uuid().optional(),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  deadline: z.string().date().optional(),
}).refine(
  (data) => !data.budgetMin || !data.budgetMax || data.budgetMin <= data.budgetMax,
  { message: "Minimum budget can't exceed maximum budget", path: ["budgetMax"] }
);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
