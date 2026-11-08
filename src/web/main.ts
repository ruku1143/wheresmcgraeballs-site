import { ACTIVITIES, SPOTTED } from "../shared/config";
import { getConfig, getHeatmap, getLeaderboard, getSightings, postSighting } from "./api";
import { spotterName } from "../shared/display";
import type { Sighting } from "./api";
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

let lastList: { sightings: Sighting[]; now: number } | null = null;
const activityDialog = $<HTMLDialogElement>("activity-dialog");
let currentTab: "recent" | "spotters" = "recent";

async function refresh() {
  try {
    // One request feeds both the banner (newest sighting + status) and the pins.
    const list = await getSightings();
    const s = list.sightings[0];
    if (!s) {
      setBanner("No sightings yet. Suspicious. Presumed arrested.", "missing");
    } else {
      const where = s.place_name ? ` near ${s.place_name}` : "";
      setBanner(
        `Last seen ${ago(list.now - s.spotted_at)}${where} — ${list.status.label}. ${list.status.blurb}`,
        list.status.key,
      );
    }
    gm.setSightings(list.sightings, list.now);
    lastList = { sightings: list.sightings, now: list.now };
    if (activityDialog.open && currentTab === "recent") renderRecent();
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

// Poll while the tab is visible: sightings every 20s, the heatmap every third tick.
const POLL_MS = 20_000;
let ticks = 0;
let timer: number | undefined;
function startPolling() {
  stopPolling();
  timer = window.setInterval(() => {
    void refresh();
    if (++ticks % 3 === 0) void refreshHeat();
  }, POLL_MS);
}
function stopPolling() {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else {
    void refresh();
    void refreshHeat();
    startPolling();
  }
});

// ---------- activity panel: recent sightings + spotters ----------
function renderRecent() {
  const ul = $("recent-list");
  ul.replaceChildren();
  if (!lastList || !lastList.sightings.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No sightings yet. Suspicious.";
    ul.append(li);
    return;
  }
  for (const s of lastList.sightings) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = s.activity;
    const sub = document.createElement("span");
    sub.className = "row-sub";
    sub.textContent = [s.place_name, ago(lastList.now - s.spotted_at), spotterName(s.nickname)]
      .filter(Boolean)
      .join(" · ");
    btn.append(title, sub);
    btn.addEventListener("click", () => {
      activityDialog.close();
      gm.focus(s.id);
    });
    li.append(btn);
    ul.append(li);
  }
}

async function renderSpotters() {
  const list = $("board-list");
  list.replaceChildren();
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  };
  try {
    const { leaderboard } = await getLeaderboard();
    if (!leaderboard.length) add("Nobody has put their name down yet.");
    for (const r of leaderboard) add(`${r.nickname} — ${r.sightings}`);
  } catch (e) {
    add((e as Error).message);
  }
}

function setTab(tab: "recent" | "spotters") {
  currentTab = tab;
  const recent = tab === "recent";
  $("tab-recent").setAttribute("aria-selected", String(recent));
  $("tab-spotters").setAttribute("aria-selected", String(!recent));
  $("panel-recent").hidden = !recent;
  $("panel-spotters").hidden = recent;
  $("activity-title").textContent = recent ? "Recent sightings" : "Top spotters";
  if (recent) renderRecent();
  else void renderSpotters();
}

$("activity-btn").addEventListener("click", () => {
  setTab("recent");
  activityDialog.showModal();
});
$("tab-recent").addEventListener("click", () => setTab("recent"));
$("tab-spotters").addEventListener("click", () => setTab("spotters"));
$("activity-close").addEventListener("click", () => activityDialog.close());

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
