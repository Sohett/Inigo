import type { APIRoute } from "astro";
import { handleLead } from "@/lib/lead-handler";

// Route rendue à la demande (le reste du site est statique / SSG).
export const prerender = false;

export const POST: APIRoute = (context) => handleLead(context);
