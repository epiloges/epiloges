import { z } from "zod";

export const discountFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .transform((v) => v.toUpperCase()),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().positive("Must be greater than 0"),
    active: z.boolean(),
    expiresAt: z.string().optional(),
    /** Total redemptions allowed. Empty = unlimited. */
    usageLimit: z.number().int("Must be a whole number").positive("Must be at least 1").optional(),
    /** Minimum cart subtotal in euros. Empty = no minimum. */
    minimumSubtotal: z.number().positive("Must be greater than 0").optional(),
    oncePerCustomer: z.boolean(),
  })
  .refine((data) => data.type !== "percentage" || data.value <= 100, {
    message: "A percentage discount can't be more than 100%.",
    path: ["value"],
  });

export type DiscountFormValues = z.infer<typeof discountFormSchema>;

export const emptyDiscountFormValues: DiscountFormValues = {
  code: "",
  type: "percentage",
  value: 10,
  active: true,
  expiresAt: undefined,
  usageLimit: undefined,
  minimumSubtotal: undefined,
  oncePerCustomer: false,
};
