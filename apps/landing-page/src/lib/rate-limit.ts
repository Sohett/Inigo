/**
 * Limiteur de débit léger, en mémoire (fenêtre glissante par clé, ex. IP).
 *
 * Best-effort : en environnement serverless (Vercel), l'état n'est pas partagé entre
 * invocations/instances — ça freine le spam basique mais ne remplace pas un store
 * distribué (Upstash) si un vrai rate-limit devient nécessaire. La défense principale
 * contre les bots reste le honeypot (cf. spec §8).
 */
const WINDOW_MS = 60_000;
const MAX_HITS = 5;

const hits = new Map<string, number[]>();

/** Renvoie `true` si la requête est autorisée, `false` si la limite est dépassée. */
export function rateLimit(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= MAX_HITS;
}
