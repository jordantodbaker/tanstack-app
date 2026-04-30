import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function computeBoreSize(size: string): string {
  const n = parseFloat(size);
  if (!size || isNaN(n)) return "";
  if (n < 3) return "SB";
  if (n <= 12) return "MB";
  if (n <= 24) return "LB";
  return "XB";
} 