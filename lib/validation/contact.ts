import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Το ονοματεπώνυμο είναι υποχρεωτικό"),
  email: z.string().trim().min(1, "Το email είναι υποχρεωτικό").email("Εισάγετε έγκυρη διεύθυνση email"),
  subject: z.string().trim().min(1, "Επιλέξτε θέμα"),
  message: z.string().trim().min(10, "Το μήνυμα πρέπει να έχει τουλάχιστον 10 χαρακτήρες"),
});

export type ContactFormValues = z.infer<typeof contactSchema>;
