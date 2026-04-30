import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/basis")({
  component: BasisPage,
});

function BasisPage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Basis</h1>
    </main>
  );
}
