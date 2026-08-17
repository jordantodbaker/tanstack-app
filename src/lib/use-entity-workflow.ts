import { availableTransitions, type Transition } from "~/utils/workflow";
import { useCurrentUser } from "~/lib/use-current-user";

/**
 * Shared workflow wiring for the entity dialogs (CVR / FCO / RFI / Trend / PCO).
 * Each dialog body repeated the same three pieces verbatim — the current user,
 * the `isOriginator` check, and the `availableTransitions(...)` list — plus, for
 * the promotable entities, an identical `handlePromote` (confirm → busy → call →
 * close). This centralizes all of it.
 *
 * `S` (the status union) is inferred from `transitionMap`, so `initial.status`
 * stays fully typed per entity.
 */
export function useEntityWorkflow<S extends string>({
  transitionMap,
  initial,
  onTransition,
  onPromote,
  promoteConfirmMessage,
  setBusy,
  closeDialog,
}: {
  /** The entity's status→transitions table, e.g. `FCO_TRANSITIONS`. */
  transitionMap: Record<S, Transition<S>[]>;
  /** The record being edited; `undefined` on the create form. */
  initial: { id: number; status: S; createdById: number | null } | undefined;
  /** The dialog's transition handler. Only its presence is checked — it gates
   *  whether workflow actions are offered (matches the prior inline logic). */
  onTransition: unknown;
  /** Promote-to-next-entity handler (FCO→CVR, RFI→FCO, Trend→CVR). */
  onPromote?: (id: number) => Promise<unknown>;
  /** `window.confirm` copy shown before promoting. */
  promoteConfirmMessage?: string;
  setBusy: (busy: boolean) => void;
  closeDialog: () => void;
}) {
  const { data: currentUser } = useCurrentUser();

  const isOriginator =
    !!currentUser &&
    initial?.createdById !== null &&
    initial?.createdById === currentUser.id;

  const transitions =
    initial && currentUser && onTransition
      ? availableTransitions(
          transitionMap,
          initial.status,
          currentUser.role,
          isOriginator,
        )
      : [];

  async function handlePromote() {
    if (!initial?.id || !onPromote) return;
    if (promoteConfirmMessage && !confirm(promoteConfirmMessage)) return;
    setBusy(true);
    try {
      await onPromote(initial.id);
      closeDialog();
    } finally {
      setBusy(false);
    }
  }

  return { currentUser, isOriginator, transitions, handlePromote };
}
