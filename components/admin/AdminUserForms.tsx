"use client";

import { useActionState } from "react";
import { useTransition, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  changeOwnPassword,
  createAdminUser,
  deleteAdminUser,
  resetAdminPassword,
  type UserActionState,
} from "@/app/admin/(dashboard)/users/actions";
import { ADMIN_ROLES } from "@/types/admin";

const INPUT = "h-10 w-full border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black";
const LABEL = "mb-1.5 block text-xs font-medium tracking-[0.05em] text-luxe-gray-dark uppercase";
const BUTTON = "h-10 border border-luxe-black px-5 text-xs font-medium tracking-[0.05em] uppercase disabled:opacity-50";

const ROLE_OPTION_LABEL: Record<string, string> = {
  admin: "Admin — full access",
  editor: "Editor — catalog and orders",
  product_manager: "Product Manager — products and media only",
};

function Feedback({ state }: { state: UserActionState }) {
  if (state.error) return <p className="text-xs text-destructive">{state.error}</p>;
  if (state.success) return <p className="text-xs text-green-700">{state.success}</p>;
  return null;
}

/**
 * `useActionState` rather than local state around a manual call: the form posts, the
 * server action returns its own error or confirmation, and React keeps the two in step
 * without this component holding a second copy of the truth. The password field is never
 * given a `defaultValue`, so a failed submit clears it rather than leaving a live
 * credential sitting in the DOM.
 */
export function CreateAdminUserForm() {
  const [state, action, pending] = useActionState(
    async (_prev: UserActionState, formData: FormData) => createAdminUser(formData),
    {}
  );

  return (
    <form action={action} className="border border-border bg-luxe-white p-6">
      <h3 className="text-sm font-medium tracking-[0.05em] uppercase">Add a user</h3>
      <p className="mt-1 text-xs text-luxe-gray-dark">
        They sign in with this email and password. Share the password with them directly — it is stored only
        as a hash and cannot be read back from here.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="au-name" className={LABEL}>Name</label>
          <input id="au-name" name="name" required className={INPUT} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="au-email" className={LABEL}>Email</label>
          <input id="au-email" name="email" type="email" required className={INPUT} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="au-password" className={LABEL}>Password</label>
          <input
            id="au-password"
            name="password"
            type="password"
            required
            minLength={10}
            className={INPUT}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-luxe-gray-dark">At least 10 characters.</p>
        </div>
        <div>
          <label htmlFor="au-role" className={LABEL}>Role</label>
          <select id="au-role" name="role" defaultValue="editor" className={INPUT}>
            {ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_OPTION_LABEL[role] ?? role}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Creating…" : "Create user"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ChangeOwnPasswordForm() {
  const [state, action, pending] = useActionState(
    async (_prev: UserActionState, formData: FormData) => changeOwnPassword(formData),
    {}
  );

  return (
    <form action={action} className="border border-border bg-luxe-white p-6">
      <h3 className="text-sm font-medium tracking-[0.05em] uppercase">Change your password</h3>
      <p className="mt-1 text-xs text-luxe-gray-dark">
        You will be signed out afterwards, so the change actually ends any session using the old password.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cp-current" className={LABEL}>Current password</label>
          <input id="cp-current" name="currentPassword" type="password" required className={INPUT} autoComplete="current-password" />
        </div>
        <div>
          <label htmlFor="cp-new" className={LABEL}>New password</label>
          <input id="cp-new" name="newPassword" type="password" required minLength={10} className={INPUT} autoComplete="new-password" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Saving…" : "Change password"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeleteAdminUserButton({ userId, name, isSelf }: { userId: string; name: string; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return <span className="text-xs text-luxe-gray-dark">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`Remove ${name}`}
        onClick={() => {
          if (!window.confirm(`Remove ${name}'s access to the dashboard?\n\nThey will not be able to sign in again.`)) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteAdminUser(userId);
            if (result?.error) setError(result.error);
          });
        }}
        className="flex size-8 items-center justify-center border border-border text-luxe-gray-dark transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" strokeWidth={1.5} />
      </button>
      {error ? <p className="max-w-[16rem] text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * "Reset password" for another admin: reveals a one-field form, sets the password, and
 * shows the confirmation once. Not offered for the signed-in admin — their own change goes
 * through ChangeOwnPasswordForm, which asks for the current password first.
 */
export function ResetAdminPasswordControl({ userId, name, isSelf }: { userId: string; name: string; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (isSelf) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage(null);
        }}
        className="text-xs text-luxe-gray-dark underline-offset-4 hover:underline"
      >
        Reset password
      </button>
    );
  }

  return (
    <form
      className="flex flex-col items-end gap-1"
      action={(formData) => {
        if (!window.confirm(`Set a new password for ${name}? Every session they have will be signed out.`)) return;
        startTransition(async () => {
          const result = await resetAdminPassword(userId, formData);
          if (result?.error) {
            setMessage({ tone: "error", text: result.error });
            return;
          }
          setMessage({ tone: "success", text: result?.success ?? "Password set." });
          setOpen(false);
        });
      }}
    >
      <div className="flex items-center gap-2">
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="New password (10+ characters)"
          className="h-8 w-56 border border-border bg-transparent px-2 text-xs outline-none focus:border-luxe-black"
        />
        <button type="submit" disabled={pending} className="h-8 border border-luxe-black px-3 text-xs uppercase tracking-[0.05em] disabled:opacity-50">
          {pending ? "Saving…" : "Set"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-luxe-gray-dark">
          Cancel
        </button>
      </div>
      {message ? <p className={`max-w-[20rem] text-right text-xs ${message.tone === "error" ? "text-destructive" : "text-green-700"}`}>{message.text}</p> : null}
    </form>
  );
}
