import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function computeBoreSize(size: string): string {
  const n = parseFloat(size);
  if (!size || isNaN(n)) return "";
  // Boundaries follow the CBS catalog's own size steps, which is what these
  // bands have to agree with to resolve an item: SB .5–2.5", MB 3–10",
  // LB 12–24", XB 30"+. 12" is the first large-bore step — the catalog has no
  // medium-bore 12" item, so banding it MB left every 12" line resolving to
  // the medium-bore rollup instead of its own code.
  if (n < 3) return "SB";
  if (n < 12) return "MB";
  if (n <= 24) return "LB";
  return "XB";
} 