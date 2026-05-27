import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useCurrentUser, useIsAdmin } from "~/lib/use-current-user";
import {
  attachmentsQueryOptions,
  deleteAttachment,
  downloadAttachment,
  uploadAttachment,
  MAX_ATTACHMENT_BYTES,
  type AttachmentEntityType,
  type AttachmentItem,
} from "~/utils/attachments";

/**
 * Attachments panel — used inside the CVR and FCO dialogs. Lists existing
 * uploads, accepts new ones via click or drag-and-drop, and exposes a
 * download / delete action per row. Delete is uploader-or-admin-gated to
 * match the server check.
 *
 * Files are round-tripped through base64 (see attachments.ts) so the same
 * `createServerFn` machinery the rest of the app uses also moves binaries —
 * no raw HTTP route needed.
 */
export function Attachments({
  entityType,
  entityId,
  projectId,
}: {
  entityType: AttachmentEntityType;
  entityId: number | null;
  projectId: number | null;
}) {
  const queryClient = useQueryClient();
  const { data: items = [], isPending } = useQuery(
    attachmentsQueryOptions({ entityType, entityId, projectId }),
  );
  const currentUser = useCurrentUser().data;
  const isAdmin = useIsAdmin();

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["attachments", entityType, entityId],
    });
    // Refresh the parent's audit timeline — the upload/delete posted a
    // synthetic "attachment" UPDATE event against the parent record.
    queryClient.invalidateQueries({
      queryKey: ["auditEvents", entityType, entityId],
    });
  }, [queryClient, entityType, entityId]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (projectId === null || entityId === null) {
        throw new Error("Save this record before attaching files.");
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
        throw new Error(`"${file.name}" exceeds the ${mb} MB limit.`);
      }
      const base64 = await readFileAsBase64(file);
      return uploadAttachment({
        data: {
          entityType,
          entityId,
          projectId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        },
      });
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteAttachment({ data: { id } }),
    onSuccess: invalidate,
  });

  const [dragOver, setDragOver] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      // Upload files sequentially so a hung first file doesn't block the
      // others' UI, and so the audit log records them in user-visible order.
      for (const file of Array.from(files)) {
        try {
          await upload.mutateAsync(file);
        } catch (err) {
          setUploadError(
            err instanceof Error ? err.message : `Failed to upload ${file.name}.`,
          );
        }
      }
    },
    [upload],
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (entityId === null) {
    return (
      <p className="text-sm text-slate-500">
        Save this record first; attachments can be added once it has an id.
      </p>
    );
  }

  const canUpload = projectId !== null && entityId !== null;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
          dragOver
            ? "border-red-400 bg-red-50 text-red-700"
            : "border-slate-300 bg-slate-50 text-slate-600"
        }`}
      >
        <Paperclip className="mx-auto mb-1.5 size-5 text-slate-400" />
        <p>Drag files here, or</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={!canUpload || upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1 size-3.5" />
          {upload.isPending ? "Uploading…" : "Choose files"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFiles(e.target.files);
            }
            // Reset so the same file can be re-picked after deletion.
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {uploadError}
        </p>
      )}

      {isPending ? (
        <p className="text-sm text-slate-400">Loading attachments…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">No attachments yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {items.map((item) => (
            <AttachmentRow
              key={item.id}
              item={item}
              canDelete={isAdmin || currentUser?.id === item.uploadedById}
              onDelete={() => {
                if (
                  window.confirm(
                    `Delete attachment "${item.filename}"? This cannot be undone.`,
                  )
                ) {
                  void remove.mutateAsync(item.id);
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentRow({
  item,
  canDelete,
  onDelete,
}: {
  item: AttachmentItem;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [downloading, setDownloading] = React.useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const result = await downloadAttachment({ data: { id: item.id } });
      triggerBrowserDownload(result.filename, result.mimeType, result.base64);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <Paperclip className="size-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-slate-800">
          {item.filename}
        </div>
        <div className="text-xs text-slate-500">
          {formatBytes(item.sizeBytes)} · {item.uploadedByEmail} ·{" "}
          {new Date(item.createdAt).toLocaleString()}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={handleDownload}
        title="Download"
      >
        <Download className="size-3.5" />
      </Button>
      {canDelete && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDelete}
          title="Delete"
          className="text-red-700 hover:bg-red-50"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a File into a base64 string (sans the `data:...;base64,` prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result."));
        return;
      }
      const marker = "base64,";
      const idx = result.indexOf(marker);
      resolve(idx >= 0 ? result.slice(idx + marker.length) : "");
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(file);
  });
}

/** Decodes a base64 payload into a Blob and triggers a browser download. */
function triggerBrowserDownload(
  filename: string,
  mimeType: string,
  base64: string,
): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
