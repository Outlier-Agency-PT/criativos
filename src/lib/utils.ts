import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // (c) Torriani — proprietary, see LICENSE
  return twMerge(clsx(inputs));
}

