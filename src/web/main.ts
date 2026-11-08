import { ACTIVITIES, SPOTTED } from "../shared/config";
import {
  getConfig,
  getHeatmap,
  getLatest,
  getLeaderboard,
  getSightings,
  postSighting,
} from "./api";
import { GraeballsMap } from "./map";
import { ago } from "./time";
import L from "leaflet";
import { BOUNDS } from "../shared/config";

declare global {
  interface Window {
    turnstile?: {
      render(
        el: HTMLElement,
        opts: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void },
      ): string;
      reset(id?: string): void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gm = new GraeballsMap($("map"));

// ---------- banner + map data ----------
function setBanner(text: string, status: string) {
  $("banner").dataset.status = status;
  $("banner-text").textContent = text;
}

async function refresh() {
  try {
    const [latest, list] = await Promise.all([getLatest(), getSightings()]);
    if (!latest.sighting) {
      setBanner("No sightings yet. Suspicious. Presumed arrested.", "missing");
    } else {
      const s = latest.sighting;
      const where = s.place_name ? ` near ${s.place_name}` : "";
      setBanner(
        `Last seen ${ago(latest.now - s.spotted_at)}${where} — ${latest.status.label}. ${latest.status.blurb}`,
        latest.status.key,
      );
    }
    gm.setSightings(list.sightings, list.now);
  } catch (e) {
    setBanner((e as Error).message, "missing");
  }
}

async function refreshHeat() {
  try {
    gm.setHeat((await getHeatmap()).points);
  } catch {
    /* heatmap is optional */
  }
}

let timer: number | undefined;
function startPolling() {
  stopPolling();
  timer = window.setInterval(refresh, 60_000);
}
function stopPolling() {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else {
    void refresh();
    startPolling();
  }
});

// ---------- leaderboard ----------
const boardDialog = $<HTMLDialogElement>("board-dialog");
$("board-btn").addEventListener("click", async () => {
  const list = $("board-list");
  list.replaceChildren();
  try {
    const { leaderboard } = await getLeaderboard();
    if (!leaderboard.length) {
      const li = document.createElement("li");
      li.textContent = "Nobody has put their name down yet.";
      list.append(li);
    }
    for (const r of leaderboard) {
      const li = document.createElement("li");
      li.textContent = `${r.nickname} — ${r.sightings}`;
      list.append(li);
    }
  } catch (e) {
    const li = document.createElement("li");
    li.textContent = (e as Error).message;
    list.append(li);
  }
  boardDialog.showModal();
});
$("board-close").addEventListener("click", () => boardDialog.close());

// ---------- add a sighting ----------
const formDialog = $<HTMLDialogElement>("form-dialog");
const form = $<HTMLFormElement>("sighting-form");
const msg = $("form-msg");
const addBtn = $<HTMLButtonElement>("add-btn");
const hint = $("hint");
const select = form.querySelector("select")!;
for (const a of ACTIVITIES) select.add(new Option(a, a));

let chosen: L.LatLng | null = null;
let token = "";
let widgetId: string | undefined;
let siteKey: string | null = null;
let pickCancel: (() => void) | null = null;

async function ensureTurnstile() {
  if (!siteKey) siteKey = (await getConfig()).turnstileSiteKey;
  if (typeof window.turnstile?.render !== "function") {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = () =>
        typeof window.turnstile?.render === "function"
          ? resolve()
          : reject(new Error("Couldn't load the human check. Try again in a moment."));
      s.onerror = () => reject(new Error("Couldn't load the human check."));
      document.head.append(s);
    });
  }
  const box = $("turnstile");
  if (widgetId === undefined) {
    widgetId = window.turnstile!.render(box, {
      sitekey: siteKey,
      callback: (t) => (token = t),
      "expired-callback": () => (token = ""),
    });
  } else {
    window.turnstile!.reset(widgetId);
    token = "";
  }
}

function stopPicking() {
  hint.hidden = true;
  addBtn.textContent = "I saw him!";
  pickCancel = null;
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function openForm(ll: L.LatLng) {
  chosen = ll;
  const when = $<HTMLInputElement>("spotted-at");
  const now = new Date();
  when.max = localInputValue(now);
  when.min = localInputValue(new Date(now.getTime() - SPOTTED.maxAgeSeconds * 1000));
  when.value = localInputValue(now);
  gm.showPicker(ll);
  msg.textContent = "";
  msg.className = "msg";
  formDialog.showModal();
  try {
    await ensureTurnstile();
  } catch (e) {
    msg.textContent = (e as Error).message;
    msg.className = "msg error";
  }
}

addBtn.addEventListener("click", async () => {
  if (pickCancel) {
    pickCancel();
    return;
  }
  hint.hidden = false;
  addBtn.textContent = "Cancel";
  const { result, cancel } = gm.pick();
  pickCancel = cancel;
  const ll = await result;
  stopPicking();
  if (ll) await openForm(ll);
});

$("locate-btn").addEventListener("click", () => {
  const btn = $<HTMLButtonElement>("locate-btn");
  if (!navigator.geolocation) return;
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      const { latitude: lat, longitude: lng } = pos.coords;
      const inside =
        lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;
      if (!inside) {
        alert("You're not in Basingstoke. Tap the map instead.");
        return;
      }
      pickCancel?.();
      stopPicking();
      void openForm(L.latLng(lat, lng));
    },
    () => {
      btn.disabled = false;
      alert("Couldn't get your location. Tap the map instead.");
    },
    { enableHighAccuracy: true, timeout: 10_000 },
  );
});

$("cancel-btn").addEventListener("click", () => {
  formDialog.close();
  gm.clearPicker();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chosen) return;
  if (!token) {
    msg.textContent = "Please complete the human check.";
    msg.className = "msg error";
    return;
  }
  const spottedMs = new Date($<HTMLInputElement>("spotted-at").value).getTime();
  if (Number.isNaN(spottedMs)) {
    msg.textContent = "Pick when you saw him.";
    msg.className = "msg error";
    return;
  }
  if (spottedMs > Date.now()) {
    msg.textContent = "He can't have been spotted in the future.";
    msg.className = "msg error";
    return;
  }
  const btn = $<HTMLButtonElement>("submit-btn");
  btn.disabled = true;
  const data = new FormData(form);
  const val = (k: string) => String(data.get(k) ?? "").trim();
  try {
    await postSighting({
      lat: chosen.lat,
      lng: chosen.lng,
      activity: val("activity"),
      place_name: val("place_name") || undefined,
      note: val("note") || undefined,
      nickname: val("nickname") || undefined,
      spotted_at: Math.floor(spottedMs / 1000),
      turnstileToken: token,
    });
    msg.textContent = "Logged. Legend.";
    msg.className = "msg ok";
    form.reset();
    gm.clearPicker();
    setTimeout(() => formDialog.close(), 700);
    void refresh();
    void refreshHeat();
  } catch (err) {
    msg.textContent = (err as Error).message;
    msg.className = "msg error";
    if (widgetId !== undefined) window.turnstile?.reset(widgetId);
    token = "";
  } finally {
    btn.disabled = false;
  }
});

$("version").textContent = `v${__APP_VERSION__}`;
void refresh();
void refreshHeat();
startPolling();
