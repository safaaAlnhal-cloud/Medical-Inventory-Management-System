import React, { useState } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import CameraScanner from './CameraScanner';

// A box that takes a factory barcode in three ways:
//   - a USB / Bluetooth scanner, which types the code and presses Enter (no library needed);
//   - typing the code and pressing Enter or the Find button;
//   - the camera button, which reads it with the device camera.
// It only collects the code: onScan(code) decides what to do with it.
//   busy   true while the parent is looking the code up (the box waits)
const ScanInput = ({ onScan, busy = false, label = 'Scan barcode' }) => {
  const [code, setCode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

  const submit = (value) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setCode('');
    onScan(trimmed);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <ScanLine className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          aria-label={label}
          placeholder={`${label}...`}
          maxLength={64}
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          // A scanner ends with Enter. This box is never inside a form, so Enter cannot save one.
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(code); } }}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#115e54]"
        />
      </div>
      <button type="button" disabled={busy || !code.trim()} onClick={() => submit(code)} className="px-3 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? 'Finding...' : 'Find'}
      </button>
      <button type="button" disabled={busy} onClick={() => setCameraOpen(true)} className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50" title="Scan with the camera" aria-label="Scan with the camera">
        <Camera className="w-4 h-4" />
      </button>
      {cameraOpen && (
        <CameraScanner
          onDetected={(detected) => { setCameraOpen(false); submit(detected); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
};

export default ScanInput;
