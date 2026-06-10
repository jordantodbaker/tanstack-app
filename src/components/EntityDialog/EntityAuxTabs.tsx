import type { ReactNode } from "react";
import { TabsContent, TabsTrigger } from "~/components/ui/tabs";
import { Attachments } from "~/components/Attachments";
import { Comments } from "~/components/Comments";
import { AuditTimeline } from "~/components/AuditTimeline";
import type { AttachmentEntityType } from "~/utils/attachments";

/**
 * The Attachments / Comments / History tabs are byte-identical across all five
 * entity dialogs (CVR/FCO/RFI/Trend/PCO) — only the polymorphic `entityType`
 * differs. These two pieces render that shared trio: `EntityAuxTabTriggers`
 * goes in the dialog's `<TabsList>` (after its entity-specific Details/etc.
 * triggers), and `EntityAuxTabPanels` renders the matching `<TabsContent>`
 * bodies. Both must live inside the dialog's `<Tabs>` so Radix's context wires
 * the trigger ↔ panel pairing.
 *
 * `AttachmentEntityType` and `CommentEntityType` are the same union; AuditTimeline
 * accepts a plain string, so one prop type covers all three children.
 */
export function EntityAuxTabTriggers() {
  return (
    <>
      <TabsTrigger value="attachments">Attachments</TabsTrigger>
      <TabsTrigger value="comments">Comments</TabsTrigger>
      <TabsTrigger value="history">History</TabsTrigger>
    </>
  );
}

export function EntityAuxTabPanels({
  entityType,
  entityId,
  projectId,
  attachmentsExtra,
}: {
  entityType: AttachmentEntityType;
  entityId: number | null;
  projectId: number | null;
  /** Optional content rendered above the file list in the Attachments tab —
   *  e.g. the FCO dialog's "External link" field. */
  attachmentsExtra?: ReactNode;
}) {
  return (
    <>
      <TabsContent
        value="attachments"
        className={attachmentsExtra ? "mt-3 space-y-4" : "mt-3"}
      >
        {attachmentsExtra}
        <Attachments
          entityType={entityType}
          entityId={entityId}
          projectId={projectId}
        />
      </TabsContent>
      <TabsContent value="comments" className="mt-3">
        <Comments
          entityType={entityType}
          entityId={entityId}
          projectId={projectId}
        />
      </TabsContent>
      <TabsContent value="history" className="mt-3">
        <AuditTimeline
          entityType={entityType}
          entityId={entityId}
          projectId={projectId}
        />
      </TabsContent>
    </>
  );
}
