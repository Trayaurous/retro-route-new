import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { IconButton } from './ui.jsx';

export default function Scanner({ onRead, onError }) {
  const video = useRef(null), stream = useRef(null), running = useRef(false), input = useRef(null), generation = useRef(0), timer = useRef(null);
  const [scanning, setScanning] = useState(false);
  const stop = () => { generation.current++; running.current = false; clearTimeout(timer.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; };
  useEffect(() => {
    const hide = () => { if (document.hidden) { stop(); setScanning(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); document.removeEventListener('visibilitychange', hide); };
  }, []);

  const start = async () => {
    if (running.current) return;
    if (!navigator.mediaDevices?.getUserMedia) { onError('Camera unavailable. Use HTTPS or choose a QR image.'); return; }
    running.current = true; setScanning(true);
    const token = ++generation.current;
    try {
      const jsQR = (await import('jsqr')).default;
      if (!running.current || token !== generation.current || !video.current || document.hidden) return;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (!running.current || token !== generation.current || !video.current || document.hidden) { camera.getTracks().forEach(t => t.stop()); return; }
      stream.current = camera; video.current.srcObject = camera; await video.current.play();
      if (!running.current || token !== generation.current || !video.current) return;
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!running.current || token !== generation.current || !video.current) return;
        if (video.current.readyState >= 2) {
          const scale = Math.min(1, 1000 / video.current.videoWidth);
          canvas.width = Math.round(video.current.videoWidth * scale); canvas.height = Math.round(video.current.videoHeight * scale);
          ctx.drawImage(video.current, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code) { stop(); setScanning(false); onRead(code.data); return; }
        }
        timer.current = setTimeout(tick, 200);
      };
      tick();
    } catch (error) { if (token === generation.current) { stop(); setScanning(false); onError(`Camera could not start. ${error.message} Choose a QR image instead.`); } }
  };

  const image = async file => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { onError('Choose an image smaller than 10 MB.'); return; }
    try {
      const jsQR = (await import('jsqr')).default;
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height);
      if (!code) throw new Error('No readable QR code found.');
      stop(); setScanning(false); onRead(code.data);
    } catch (error) { onError(error.message); }
  };

  return <div className="scanner">
    <p>Scan a Retro Route code. Camera frames stay on this device.</p>
    <video ref={video} muted playsInline className={scanning ? '' : 'camera-idle'} aria-label="Camera preview" />
    <div className="action-row"><IconButton icon={Camera} label={scanning ? 'Stop camera' : 'Start camera'} active={scanning} onClick={() => { if (scanning) { stop(); setScanning(false); } else start(); }} /><IconButton icon={ImagePlus} label="Read QR image" onClick={() => input.current.click()} /></div>
    <input type="file" accept="image/*" hidden ref={input} onChange={e => { image(e.target.files?.[0]); e.target.value = ''; }} />
    <p className="muted">Open the route on your other device and display its QR code.</p>
  </div>;
}
