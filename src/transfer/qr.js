import { parseFile, routeFile } from './files.js';

export const QR_LIMIT = 1024 * 1024;
function base64(bytes) {
  let str = ''; for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function encodeRoute(route) {
  const { gzipSync, strToU8 } = await import('fflate');
  const raw = strToU8(JSON.stringify(routeFile(route)));
  if (raw.length > QR_LIMIT) throw new Error('This route is too large for one QR code. Export a file instead.');
  return `RR1:${base64(gzipSync(raw, { level: 9, mtime: 0 }))}`;
}

export async function decodeRoute(text) {
  if (!text.startsWith('RR1:')) throw new Error('Not a supported Retro Route QR code.');
  const encoded = text.slice(4);
  if (encoded.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error('Invalid QR payload.');
  const { Gunzip, strFromU8 } = await import('fflate');
  try {
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    const parts = []; let size = 0;
    const unzip = new Gunzip(chunk => { size += chunk.length; if (size > QR_LIMIT) throw new Error('QR contents exceed the limit.'); parts.push(chunk); });
    // Small compressed chunks bound allocations when reading untrusted compressed data.
    for (let i = 0; i < bytes.length; i += 128) unzip.push(bytes.subarray(i, i + 128), i + 128 >= bytes.length);
    const output = new Uint8Array(size); let cursor = 0;
    for (const part of parts) { output.set(part, cursor); cursor += part.length; }
    const preview = parseFile(strFromU8(output));
    if (preview.kind !== 'route' || preview.legacy) throw new Error('QR must contain one versioned route.');
    return preview;
  } catch (error) { throw new Error(`Cannot read this route: ${error.message}`); }
}

export async function renderRouteQr(route) {
  const text = await encodeRoute(route);
  const QRCode = (await import('qrcode')).default;
  try {
    const symbol = QRCode.create(text, { errorCorrectionLevel: 'M' });
    if (symbol.version > 32) throw new Error('Dense QR');
    const url = await QRCode.toDataURL(text, { errorCorrectionLevel: 'M', scale: 5, margin: 4, color: { dark: '#000000', light: '#ffffff' } });
    return { text, url, version: symbol.version };
  } catch { throw new Error('This route is too large for a readable QR code. Export a file instead.'); }
}
