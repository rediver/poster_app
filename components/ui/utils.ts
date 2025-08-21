import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { logModule } from "../../src/debug";
logModule("components/ui/utils.ts module");

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
