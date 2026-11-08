import L from "leaflet";
import { computeStatus, isRecent } from "../shared/status";

/** A coloured dot: colour follows the sighting's age status, recent ones get a radar ping. Styles live in styles.css. */
export function pinIcon(ageSeconds: number, newest: boolean): L.DivIcon {
  const { key } = computeStatus(ageSeconds);
  const ping = isRecent(ageSeconds) ? '<span class="ping"></span>' : "";
  return L.divIcon({
    className: "pin-wrap",
    html: `<span class="dot dot--${key}${newest ? " dot--newest" : ""}">${ping}</span>`,
    iconSize: [32, 32], // generous tap target; the visible dot is smaller
    iconAnchor: [16, 16],
    popupAnchor: [0, -12],
  });
}
