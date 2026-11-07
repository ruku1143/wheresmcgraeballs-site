import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { BOUNDS, CENTRE, DEFAULT_ZOOM } from "../shared/config";
import type { Sighting } from "./api";
import { pinIcon } from "./markers";
import { ago, londonTime } from "./time";

// CARTO basemaps now require an API key, so we use standard OSM tiles. Swap this constant (and the CSP img-src) to change basemap.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type HeatLayer = L.Layer & { setLatLngs(p: [number, number, number?][]): void };
declare module "leaflet" {
  function heatLayer(points: [number, number, number?][], options?: object): HeatLayer;
}

export class GraeballsMap {
  readonly map: L.Map;
  private pins = L.layerGroup();
  private heat = L.heatLayer([], { radius: 28, blur: 22, maxZoom: 16 });
  private picker: L.Marker | null = null;

  constructor(el: HTMLElement) {
    const bounds = L.latLngBounds([BOUNDS.south, BOUNDS.west], [BOUNDS.north, BOUNDS.east]);
    this.map = L.map(el, { center: CENTRE, zoom: DEFAULT_ZOOM, minZoom: 12, maxBounds: bounds, maxBoundsViscosity: 0.9 });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(this.map);
    this.pins.addTo(this.map);
    L.control.layers(undefined, { Sightings: this.pins, Heatmap: this.heat }, { collapsed: true }).addTo(this.map);
  }

  setSightings(list: Sighting[], now: number) {
    this.pins.clearLayers();
    list.forEach((s, i) => {
      const m = L.marker([s.lat, s.lng], { icon: pinIcon(now - s.created_at, i === 0) });
      m.bindPopup(popupContent(s, now));
      this.pins.addLayer(m);
    });
  }

  setHeat(points: [number, number][]) {
    this.heat.setLatLngs(points);
  }

  /** Let the user tap once to choose a spot. Resolves with null if cancelled. */
  pick(): { result: Promise<L.LatLng | null>; cancel: () => void } {
    this.map.getContainer().classList.add("picking");
    let done!: (v: L.LatLng | null) => void;
    const result = new Promise<L.LatLng | null>((r) => (done = r));
    const onClick = (e: L.LeafletMouseEvent) => finish(e.latlng);
    const finish = (v: L.LatLng | null) => {
      this.map.off("click", onClick);
      this.map.getContainer().classList.remove("picking");
      done(v);
    };
    this.map.on("click", onClick);
    return { result, cancel: () => finish(null) };
  }

  showPicker(ll: L.LatLng) {
    this.clearPicker();
    this.picker = L.marker(ll, { icon: pinIcon(0, true) }).addTo(this.map);
  }
  clearPicker() {
    this.picker?.remove();
    this.picker = null;
  }
}

function row(label: string, text: string): HTMLElement {
  const p = document.createElement("p");
  p.style.margin = "2px 0";
  const b = document.createElement("strong");
  b.textContent = label;
  p.append(b, document.createTextNode(text));
  return p;
}

// Built with textContent only: user text is never parsed as HTML.
function popupContent(s: Sighting, now: number): HTMLElement {
  const box = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = s.activity;
  box.append(title);
  if (s.place_name) box.append(row("Near: ", s.place_name));
  if (s.note) box.append(row("", `“${s.note}”`));
  if (s.nickname) box.append(row("Spotted by: ", s.nickname));
  const t = row("", `${ago(now - s.created_at)} (${londonTime(s.created_at)})`);
  t.style.color = "#666";
  box.append(t);
  return box;
}
