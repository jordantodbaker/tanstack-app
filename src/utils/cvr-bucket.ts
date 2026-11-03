/**
 * Moved to `~/lib/cvr-bucket` on 2026-11-03: pure bucket attribution, which
 * lib modules were importing from here against the stated direction (lib
 * never reaches into utils). This path stays so existing imports keep
 * working; new code should import from `~/lib/cvr-bucket`.
 */
export * from "~/lib/cvr-bucket";
