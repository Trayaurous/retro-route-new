// New documents use WGS84. Legacy desktop points were picked on AMap GCJ-02 tiles.
const PI = Math.PI;
const A = 6378245;
const EE = 0.006693421622965943;
const outsideChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;

function offset(lat, lng) {
  const x = lng - 105, y = lat - 35;
  let dlat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dlat += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  dlat += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  dlat += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  let dlng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dlng += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  dlng += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  dlng += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  const rad = lat / 180 * PI;
  const magic = 1 - EE * Math.sin(rad) ** 2;
  return [dlat * 180 / ((A * (1 - EE)) / (magic * Math.sqrt(magic)) * PI), dlng * 180 / (A / Math.sqrt(magic) * Math.cos(rad) * PI)];
}

export function wgsToGcj(lat, lng) {
  if (outsideChina(lat, lng)) return { lat, lng };
  const [dy, dx] = offset(lat, lng);
  return { lat: lat + dy, lng: lng + dx };
}

export function gcjToWgs(lat, lng) {
  if (outsideChina(lat, lng)) return { lat, lng };
  let wlat = lat, wlng = lng;
  for (let i = 0; i < 6; i++) {
    const p = wgsToGcj(wlat, wlng);
    wlat -= p.lat - lat;
    wlng -= p.lng - lng;
  }
  return { lat: wlat, lng: wlng };
}
