import React, { useEffect, useRef, useState } from 'react';
import Modal from '../common/Modal';

// Why the camera could not start, in words the user can act on.
const cameraErrorMessage = (error) => {
  if (!window.isSecureContext) return 'The camera only works on https:// or http://localhost. Type the barcode instead.';
  if (error?.name === 'NotAllowedError') return 'Camera access was blocked. Allow the camera for this site in the browser, or type the barcode.';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'No camera was found on this device. Type the barcode instead.';
  if (error?.name === 'NotReadableError') return 'The camera is being used by another application. Close it and try again.';
  return 'The camera could not be started. Type the barcode instead.';
};

// Opens the device camera and reads the first factory barcode it sees, then closes itself.
// The barcode library (@zxing/browser) is loaded only now, when the camera is opened, so it
// adds nothing to the pages that never use it.
//   onDetected(code)  the barcode text that was read
//   onClose()         closed without reading one
const CameraScanner = ({ onDetected, onClose }) => {
  const videoRef = useRef(null);
  // The latest onDetected, read when a barcode is found, so a new function from the parent on
  // each render never restarts the camera.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let controls = null;
    let cancelled = false;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera API');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        // facingMode "environment": the back camera on a phone; a computer uses its only camera.
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            controls?.stop();
            onDetectedRef.current(result.getText().trim());
          },
        );
        if (cancelled) controls.stop();
        else setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setStarting(false);
          setError(cameraErrorMessage(err));
        }
      }
    };

    start();
    // Leaving the dialog always turns the camera off.
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <Modal title="Scan a Barcode" subtitle={<p className="text-xs text-slate-500 font-semibold mt-0.5">Hold the barcode in front of the camera.</p>} onClose={onClose}>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>
      ) : (
        <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {starting && <p className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">Starting the camera...</p>}
          {/* A guide line, so the user knows where to hold the barcode. */}
          {!starting && <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-red-500/80" aria-hidden="true" />}
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">Cancel</button>
      </div>
    </Modal>
  );
};

export default CameraScanner;
