import { z } from "zod";

export const conciergeSchema = z.object({
  name: z.string().trim().min(1, "Το ονοματεπώνυμο είναι υποχρεωτικό"),
  email: z.string().trim().min(1, "Το email είναι υποχρεωτικό").email("Εισάγετε έγκυρη διεύθυνση email"),
  topic: z.string().trim().min(1, "Επιλέξτε θέμα"),
  message: z.string().trim().min(10, "Πείτε μας λίγα περισσότερα — τουλάχιστον 10 χαρακτήρες"),
});

export type ConciergeFormValues = z.infer<typeof conciergeSchema>;
