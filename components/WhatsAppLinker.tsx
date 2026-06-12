'use client';

import { useState, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type LinkingState = 'idle' | 'starting' | 'polling_qr' | 'scanning' | 'connected' | 'error';

export function WhatsAppLinker() {
  const [state, setState]           = useState<LinkingState>('idle');
  const [qrBase64, setQrBase64]     = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const pollRef                     = useRef<NodeJS.Timeout | null>(null);
  const instanceRef                 = useRef<string | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Get the tenant ID (used as the Evolution API instance name)
  const getTenantId = async (): Promise<string> => {
    const user = getAuth().currentUser;
    if (!user) throw new Error('Not logged in');
    const snap = await getDoc(doc(db, 'users', user.uid));
    const tenantId = snap.data()?.tenantId as string | undefined;
    if (!tenantId) throw new Error('No tenant found for this account');
    return tenantId;
  };

  const startAuth = async () => {
    try {
      setState('starting');
      setError(null);
      setQrBase64(null);

      const tenantId = await getTenantId();
      instanceRef.current = tenantId;

      // Create (or recreate) the Evolution API instance for this tenant
      const res = await fetch('/api/whatsapp/create-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: tenantId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create WhatsApp instance');
      }

      const data = await res.json();

      // Evolution API sometimes returns the QR immediately on create
      if (data.qrBase64) {
        setQrBase64(data.qrBase64);
        setState('scanning');
        pollRef.current = setInterval(() => checkStatus(tenantId), 3000);
        return;
      }

      // Otherwise poll for QR code
      setState('polling_qr');
      let attempts = 0;

      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 20) { // 60 second timeout
          stopPolling();
          setError('Timed out waiting for QR code. Please try again.');
          setState('error');
          return;
        }

        try {
          const qrRes = await fetch(
            `/api/whatsapp/qr-code?instanceName=${encodeURIComponent(tenantId)}`,
            { cache: 'no-store' }
          );

          if (!qrRes.ok) return; // Not ready yet, keep polling

          const qrData = await qrRes.json();
          const base64 = qrData.base64 ?? qrData.qrcode?.base64;

          if (base64) {
            setQrBase64(base64);
            setState('scanning');
            stopPolling();
            pollRef.current = setInterval(() => checkStatus(tenantId), 3000);
          }
        } catch {
          // Network blip, keep polling
        }
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  };

  const checkStatus = async (instanceName: string) => {
    try {
      const res  = await fetch(`/api/whatsapp/status?instanceName=${encodeURIComponent(instanceName)}`, { cache: 'no-store' });
      const data = await res.json();

      // Evolution API returns state: "open" when connected
      if (data.instance?.state === 'open' || data.state === 'open') {
        setPhoneNumber(data.instance?.ownerJid?.split('@')[0] ?? null);
        setState('connected');
        stopPolling();
      }
    } catch {
      // Keep polling
    }
  };

  const disconnect = async () => {
    try {
      setState('starting');
      stopPolling();
      const tenantId = instanceRef.current ?? await getTenantId();
      await fetch(`/api/whatsapp/delete-instance`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: tenantId }),
      });
      setState('idle');
      setPhoneNumber(null);
      setQrBase64(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
      setState('error');
    }
  };

  // Check existing connection on mount
  useEffect(() => {
    const checkExisting = async () => {
      try {
        const tenantId = await getTenantId();
        instanceRef.current = tenantId;
        const res  = await fetch(`/api/whatsapp/status?instanceName=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.instance?.state === 'open' || data.state === 'open') {
          setPhoneNumber(data.instance?.ownerJid?.split('@')[0] ?? null);
          setState('connected');
        }
      } catch {
        // Not connected, stay idle
      }
    };
    checkExisting();
    return () => stopPolling();
  }, []);

  if (state === 'connected') {
    return (
      <div className="rounded-lg bg-green-50 p-6 border border-green-200">
        <h3 className="text-lg font-semibold text-green-900 mb-2">WhatsApp Connected</h3>
        {phoneNumber && <p className="text-green-800 mb-4">Number: +{phoneNumber}</p>}
        <button onClick={disconnect} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
          Disconnect
        </button>
      </div>
    );
  }

  if (state === 'scanning' && qrBase64) {
    return (
      <div className="rounded-lg bg-blue-50 p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">Scan QR Code</h3>
        <p className="text-blue-800 mb-4">
          Open WhatsApp on your phone, tap <strong>Settings &gt; Linked Devices &gt; Link a Device</strong>, then scan this code.
        </p>
        <div className="flex justify-center my-4">
          <img
            src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
            alt="WhatsApp QR Code"
            width={256}
            height={256}
            className="rounded"
          />
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
      <button onClick={startAuth} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
        Connect WhatsApp
      </button>
    </div>
  );
}
