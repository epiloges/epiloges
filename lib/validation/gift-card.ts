import { z } from "zod";

export const giftCardFormSchema = z.object({
  // Blank is allowed and means "generate one for me" (see lib/gift-card-code.ts). A code
  // someone types is still accepted, so a physical card printed in advance can be issued
  // — but the form makes generating the default, because a typed code is a guessable one.
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase()),
  balanceAmount: z.number().positive("Must be greater than 0"),
  active: z.boolean(),
});
export type GiftCardFormValues = z.infer<typeof giftCardFormSchema>;

export const emptyGiftCardFormValues: GiftCardFormValues = {
  code: "",
  balanceAmount: 50,
  active: true,
};
