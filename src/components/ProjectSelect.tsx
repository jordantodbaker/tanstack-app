import { useQuery } from "@tanstack/react-query";
import { cn } from "~/lib/utils";
import { useSelectedProject } from "~/lib/selected-project";
import { projectsQueryOptions } from "~/utils/projects";

export function ProjectSelect({
  id,
  className,
  placeholder = "Select a project…",
}: {
  id?: string;
  className?: string;
  placeholder?: string;
}) {
  const { data: projects = [] } = useQuery(projectsQueryOptions());
  const { projectId, setProjectId } = useSelectedProject();

  return (
    <select
      id={id}
      value={projectId ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        setProjectId(v ? Number(v) : null);
      }}
      className={cn(
        "h-8 rounded-md border border-input bg-white px-2 text-sm",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayId} — {p.name}
        </option>
      ))}
    </select>
  );
}
