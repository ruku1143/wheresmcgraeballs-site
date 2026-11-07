import L from "leaflet";

// Placeholder pin. Swap this one function when a logo/avatar is supplied.
export function pinIcon(ageSeconds: number, newest: boolean): L.DivIcon {
  const day = 86400;
  const opacity = Math.max(0.35, 1 - ageSeconds / (7 * day));
  return L.divIcon({
    className: "",
    html: `<div class="pin${newest ? " newest" : ""}" style="opacity:${opacity.toFixed(2)}">🎤</div>`,
    iconSize: newest ? [34, 34] : [26, 26],
    iconAnchor: newest ? [17, 30] : [13, 24],
    popupAnchor: [0, -22],
  });
}
