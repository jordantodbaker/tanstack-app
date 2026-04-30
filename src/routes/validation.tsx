import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/validation")({
  component: ValidationPage,
});

function ValidationPage() {
  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Validation</h1>
    </main>
  );
}
