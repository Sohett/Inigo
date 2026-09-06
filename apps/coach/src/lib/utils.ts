import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class lists, last conflicting utility wins. Same helper as landing-page. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
