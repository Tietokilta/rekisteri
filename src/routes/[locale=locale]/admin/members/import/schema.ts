import * as z from "zod";

export const csvRowSchema = z.object({
	firstNames: z.string().min(1, "First names are required"),
	lastName: z.string().min(1, "Last name is required"),
	homeMunicipality: z.string().min(1, "Home municipality is required"),
	email: z.email("Invalid email format"),
	membershipType: z.string().min(1, "Membership type is required"),
	membershipStartDate: z.string().min(1, "Membership start date is required"),
});

export const importSchema = z.object({
	rows: z.array(csvRowSchema),
});

export type CsvRow = z.infer<typeof csvRowSchema>;
export type ImportData = z.infer<typeof importSchema>;
