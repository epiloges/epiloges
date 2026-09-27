import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";

/**
 * The English messages in lib/validation/auth.ts, keyed to their entry under "Validation" in
 * messages/*.json.
 *
 * Those schemas are shared by the account forms and the server routes, and carry fixed English
 * text — so a Greek shopper registering was told "Use at least 8 characters" and "Passwords
 * don't match" on an otherwise Greek page. The checkout's schemas take a translator; rather
 * than thread one through six account forms, this translates the known messages on the way
 * out of the resolver. An unknown message is shown unchanged, so nothing can go blank.
 */
const MESSAGE_KEYS: Record<string, string> = {
  "Email is required": "emailRequired",
  "Enter a valid email address": "emailInvalid",
  "First name is required": "firstNameRequired",
  "Last name is required": "lastNameRequired",
  "Password is required": "passwordRequired",
  "Use at least 8 characters": "passwordMin",
  "Use fewer than 200 characters": "passwordMax",
  "That password is too common — please choose another": "passwordCommon",
  "Confirm your password": "passwordConfirm",
  "Confirm your new password": "passwordConfirm",
  "Passwords don't match": "passwordMismatch",
  "Current password is required": "currentPasswordRequired",
};

/** Wraps a resolver so its known English messages come out in the shopper's language. */
export function localizedResolver<T extends FieldValues>(resolver: Resolver<T>, translate: (key: string) => string): Resolver<T> {
  return async (values, context, options) => {
    const result = await resolver(values, context, options);
    translateErrors(result.errors as FieldErrors, translate);
    return result;
  };
}

function translateErrors(errors: FieldErrors | undefined, translate: (key: string) => string): void {
  if (!errors) return;
  for (const error of Object.values(errors)) {
    if (!error || typeof error !== "object") continue;
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && MESSAGE_KEYS[message]) {
      (error as { message: string }).message = translate(MESSAGE_KEYS[message]);
    }
    // Nested fields (arrays, objects) carry their own errors one level down.
    if (!("message" in error) || typeof message !== "string") translateErrors(error as FieldErrors, translate);
  }
}
