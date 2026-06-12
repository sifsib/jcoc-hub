// components/WhatsAppLinker.tsx - Add to kereke-hub

'use client';

import { useState, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';

type LinkingState = 'idle' | 'starting' | 'polling_qr' | 'scanning' | 'connected' | 'error';

export function WhatsAppLinker() {
  const [state, setState] = useState<LinkingState>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const getToken = async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  };

  const startAuth = async () => {
    try {
      setState('starting');
      setError(null);
      setQrCode(null);

      // Step 1: tell the Railway service to start a socket for this tenant
      const startRes = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'start-auth' })
      });

      if (!startRes.ok) throw new Error('Failed to start auth');

      const startData = await startRes.json();

      // If already connected, just show connected state
      if (startData.status === 'already_connected') {
        const statusRes = await fetch('/api/whatsapp?action=status', {
          headers: { Authorization: `Bearer ${await getToken()}` }
        });
        const statusData = await statusRes.json();
        setPhoneNumber(statusData.phone);
        setState('connected');
        return;
      }

      // Step 2: socket is initializing, poll for QR code
      setState('polling_qr');
      let qrAttempts = 0;

      pollRef.current = setInterval(async () => {
        try {
          qrAttempts++;

          // Stop trying after ~60 seconds (20 attempts x 3s)
          if (qrAttempts > 20) {
            stopPolling();
            setError('Timed out waiting for QR code. Please try again.');
            setState('error');
            return;
          }

          const qrRes = await fetch('/api/whatsapp?action=qr', {
            headers: { Authorization: `Bearer ${await getToken()}` }
          });

          if (qrRes.status === 404) return; // QR not ready yet, keep polling

          if (!qrRes.ok) throw new Error('QR request failed');

          const qrData = await qrRes.json();
          if (qrData.qr) {
            setQrCode(qrData.qr);
            setState('scanning');
            stopPolling();

            // Now poll for connection status
            pollRef.current = setInterval(checkStatus, 3000);
          }
        } catch (err) {
          console.error('QR poll error:', err);
        }
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  };

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp?action=status', {
        headers: { Authorization: `Bearer ${await getToken()}` }
      });
      const data = await res.json();

      if (data.connected) {
        setPhoneNumber(data.phone);
        setState('connected');
        stopPolling();
      }
    } catch (err) {
      console.error('Status check error:', err);
    }
  };

  const disconnect = async () => {
    try {
      setState('starting');
      stopPolling();
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'disconnect' })
      });
      setState('idle');
      setPhoneNumber(null);
      setQrCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  if (state === 'connected') {
    return (
      <div className="rounded-lg bg-green-50 p-6 border border-green-200">
        <h3 className="text-lg font-semibold text-green-900 mb-2">WhatsApp Connected</h3>
        <p className="text-green-800 mb-4">Phone: {phoneNumber}</p>
        <button
          onClick={disconnect}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (state === 'scanning' && qrCode) {
    return (
      <div className="rounded-lg bg-blue-50 p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">Scan QR Code</h3>
        <p className="text-blue-800 mb-2">
          Open WhatsApp on your phone, tap <strong>Settings &gt; Linked Devices &gt; Link a Device</strong>, then scan this code.
        </p>
        <div className="flex justify-center my-4">
          <QRCodeSVG value={qrCode} size={256} />
        </div>
        <p className="text-sm text-blue-700 text-center">Waiting for scan...</p>
      </div>
    );
  }

  if (state === 'polling_qr' || state === 'starting') {
    return (
      <div className="rounded-lg bg-gray-50 p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Connecting...</h3>
        <p className="text-gray-600">Generating QR code, please wait.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg bg-red-50 p-6 border border-red-200">
        <h3 className="text-lg font-semibold text-red-900 mb-2">Something went wrong</h3>
        <p className="text-red-800 mb-4">{error}</p>
        <button
          onClick={() => { setState('idle'); setError(null); }}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gray-50 p-6 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect WhatsApp</h3>
      <p className="text-gray-700 mb-4">Link your church WhatsApp number to send messages directly from the hub.</p>
      <button
        onClick={startAuth}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        Connect WhatsApp
      </button>
    </div>
  );
}
