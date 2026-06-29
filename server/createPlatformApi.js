import { createServerlessApp } from "./createServerlessApp.js";

/** Unified Node API for Vercel (notes, IPAM, inventory). */
export function createPlatformApi() {
  return createServerlessApp("all");
}
