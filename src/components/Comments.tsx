import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  commentsQueryOptions,
  postComment,
  MAX_COMMENT_LENGTH,
  type CommentEntityType,
  type CommentItem,
} from "~/utils/comments";

/**
 * Threaded-discussion panel for a CVR / FCO / RFI. Appears in the dialog's
 * "Comments" tab. Append-only — no edit, no delete in v1.
 *
 * Layout:
 *   - List of comments, oldest at top → newest at bottom (conversation order).
 *     The compose box sits at the bottom so the fresh message lives next to
 *     where the user is typing.
 *   - Compose box: textarea + Post button. Cmd/Ctrl+Enter submits.
 *
 * When the parent record isn't saved yet (`entityId === null`), the panel
 * shows a placeholder, same pattern as `<Attachments>`.
 */
export function Comments({
  entityType,
  entityId,
  projectId,
}: {
  entityType: CommentEntityType;
  entityId: number | null;
  projectId: number | null;
}) {
  const queryClient = useQueryClient();
  const { data: items = [], isPending } = useQuery(
    commentsQueryOptions({ entityType, entityId, projectId }),
  );

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["comments", entityType, entityId],
    });
  }, [queryClient, entityType, entityId]);

  const post = useMutation({
    mutationFn: async (body: string) => {
      if (projectId === null || entityId === null) {
        throw new Error("Save this record before posting comments.");
      }
      return postComment({
        data: { entityType, entityId, projectId, body },
      });
    },
    onSuccess: () => {
      setDraft("");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    },
  });

  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const trimmedLength = draft.trim().length;
  const canSubmit =
    !post.isPending &&
    entityId !== null &&
    projectId !== null &&
    trimmedLength > 0 &&
    trimmedLength <= MAX_COMMENT_LENGTH;

  function handleSubmit() {
    if (!canSubmit) return;
    void post.mutateAsync(draft);
  }

  if (entityId === null) {
    return (
      <p className="text-sm text-slate-500">
        Save this record first; comments can be added once it has an id.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {isPending ? (
        <p className="text-sm text-slate-400">Loading comments…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No comments yet. Start the conversation below.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <CommentRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter submits — standard chat-app shortcut.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a comment… (Cmd/Ctrl+Enter to post)"
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
        />
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${
              trimmedLength > MAX_COMMENT_LENGTH * 0.9
                ? "text-amber-700"
                : "text-slate-400"
            }`}
          >
            {trimmedLength} / {MAX_COMMENT_LENGTH}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Send className="size-3.5 mr-1" />
            {post.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function CommentRow({ item }: { item: CommentItem }) {
  return (
    <li className="border-l-2 border-slate-200 pl-3">
      <div className="text-xs text-slate-400">
        {item.authorEmail} · {new Date(item.createdAt).toLocaleString()}
      </div>
      <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
        {item.body}
      </div>
    </li>
  );
}
