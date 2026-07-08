import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Labeled } from "~/components/ui/form-helpers";
import { useFormDialog } from "~/lib/use-form-dialog";
import type { ScheduleItem, UpsertScheduleInput } from "~/utils/schedules";

type FormState = { id?: number; name: string; position?: number };

export function ScheduleDialog({
  trigger,
  initial,
  onSubmit,
  onDelete,
}: {
  trigger: React.ReactNode;
  initial?: ScheduleItem;
  onSubmit: (form: UpsertScheduleInput) => Promise<unknown>;
  onDelete?: (id: number) => Promise<unknown>;
}) {
  const { open, setOpen, form, busy, update, handleSubmit, handleDelete } =
    useFormDialog<ScheduleItem, FormState>({
      initial,
      blank: () => ({ name: "" }),
      fromItem: (s) => ({ id: s.id, name: s.name, position: s.position }),
      onSubmit,
      onDelete,
      deleteConfirm: (s) =>
        `Delete schedule "${s.name}"? This removes every role rate at this ` +
        `schedule and clears it from any crew mix that used it. Existing Take ` +
        `Off rows keep their snapshotted values. This cannot be undone.`,
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[min(95vw,480px)]">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {initial ? "Edit Schedule" : "New Schedule"}
              </h2>
              <p className="text-xs text-slate-500">
                A labor schedule (crew/shift code) that roles carry a rate for
                and crew mixes are priced at.
              </p>
            </div>
            {initial && onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={busy}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>

          <Labeled label="Name" help="e.g. 1x6x10 (shifts × days × hours)">
            <Input
              value={form.name}
              placeholder="1x6x10"
              onChange={(e) => update("name", e.target.value)}
            />
          </Labeled>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !form.name.trim()}
            >
              {busy ? "Saving…" : initial ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
