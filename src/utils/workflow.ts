/**
 * The workflow tables moved to `~/lib/workflow` on 2026-11-03: they are pure
 * data, and lib modules were importing them from here against the stated
 * direction (lib never reaches into utils). This path stays so existing
 * imports keep working; new code should import from `~/lib/workflow`.
 */
export * from "~/lib/workflow";
