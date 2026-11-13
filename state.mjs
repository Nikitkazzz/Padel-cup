// GET  /api/state  -> whole tournament state (public, read-only)
// POST /api/state  -> {pin, op: "check" | "tour" | "season" | "delete", id?, data?}
// Writes require the ORGANIZER_PIN environment variable set in Netlify.
import { getStore } from "@netlify/blobs";
import seed from "./seed.mjs";

const KEY = "state";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function samePin(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default async (req) => {
  const store = getStore({ name: "padel-cup", consistency: "strong" });
  const load = async () => (await store.get(KEY, { type: "json" })) || structuredClone(seed);

  if (req.method === "GET") return json(await load());
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const pin = Netlify.env.get("ORGANIZER_PIN");
  if (!pin) return json({ error: "ORGANIZER_PIN не задан в настройках Netlify" }, 500);

  const raw = await req.text();
  if (raw.length > 200000) return json({ error: "too large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }

  if (!samePin(String(body.pin || ""), pin)) {
    await sleep(800);
    return json({ error: "pin" }, 401);
  }

  const state = await load();
  state.tours = state.tours || {};
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

  switch (body.op) {
    case "check":
      return json(state);
    case "tour":
      if (!/^t\d{1,3}$/.test(body.id || "") || !isObj(body.data)) return json({ error: "bad tour" }, 400);
      state.tours[body.id] = body.data;
      break;
    case "delete":
      if (!/^t\d{1,3}$/.test(body.id || "")) return json({ error: "bad id" }, 400);
      delete state.tours[body.id];
      break;
    case "season":
      if (!isObj(body.data)) return json({ error: "bad season" }, 400);
      state.season = body.data;
      break;
    default:
      return json({ error: "bad op" }, 400);
  }
  await store.setJSON(KEY, state);
  return json(state);
};

export const config = { path: "/api/state" };
