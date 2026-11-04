import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import type { DashboardWidget } from "~/config/dashboard-widgets";

/**
 * The sortable widget list inside the Customize dialog — the part that needs
 * drag-and-drop. Split out so `DashboardCustomizeDialog` can load it lazily:
 * the dnd-kit packages are about a fifth of the dashboard chunk, and nobody
 * pays for them until they open the dialog.
 */
export function DashboardCustomizeList({
  order,
  hidden,
  widgetById,
  onReorder,
  onToggle,
}: {
  /** Widget ids in display order. */
  order: readonly string[];
  hidden: ReadonlySet<string>;
  widgetById: ReadonlyMap<string, DashboardWidget>;
  onReorder: (next: string[]) => void;
  onToggle: (id: string) => void;
}) {
  // Drag-and-drop sensors. PointerSensor: standard mouse/touch drag.
  // KeyboardSensor: tab to a row, press space to grab, arrows to reorder,
  // space to drop — keyboard parity matters for an admin tool.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 4px activation distance so a click-to-toggle-eye doesn't accidentally
      // start a drag.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove([...order], from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={[...order]}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-1.5">
          {order.map((id) => {
            const w = widgetById.get(id);
            if (!w) return null; // stale id from removed widget — skip
            return (
              <SortableRow
                key={id}
                widget={w}
                visible={!hidden.has(id)}
                onToggle={() => onToggle(id)}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  widget,
  visible,
  onToggle,
}: {
  widget: DashboardWidget;
  visible: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
        visible
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-slate-400 hover:text-slate-700 active:cursor-grabbing"
        aria-label={`Drag to reorder ${widget.label}`}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 text-sm">{widget.label}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {widget.category}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? `Hide ${widget.label}` : `Show ${widget.label}`}
        title={visible ? "Hide widget" : "Show widget"}
        className={`rounded p-1 transition-colors ${
          visible
            ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            : "text-slate-400 hover:bg-slate-100"
        }`}
      >
        {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </li>
  );
}
