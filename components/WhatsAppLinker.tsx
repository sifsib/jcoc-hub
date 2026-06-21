'use client';

import { useState, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

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

  // Use the tenant ID as the WhatsApp session name.
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

      // Start the Railway WhatsApp session for this tenant.
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

      // The service can return the QR immediately when the session starts.
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

      // The service returns state "open" when connected.
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
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/40">
        <h3 className="text-lg font-semibold text-emerald-950 mb-2 dark:text-emerald-100">WhatsApp connected</h3>
        {phoneNumber && <p className="text-emerald-800 mb-4 dark:text-emerald-200">Number: +{phoneNumber}</p>}
        <button onClick={disconnect} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600">
          Disconnect
        </button>
      </div>
    );
  }

  if (state === 'scanning' && qrBase64) {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-6 dark:border-sky-800 dark:bg-sky-950/40">
        <h3 className="text-lg font-semibold text-sky-950 mb-4 dark:text-sky-100">Scan QR code</h3>
        <p className="text-sky-800 mb-4 dark:text-sky-200">
          Open WhatsApp on your phone, tap <strong>Settings &gt; Linked Devices &gt; Link a Device</strong>, then scan this code.
        </p>
        <div className="flex justify-center my-4">
          <img
            src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
            alt="WhatsApp QR Code"
            width={256}
            height={256}
            className="rounded border border-slate-200 bg-white p-2"
          />
        </div>
        <p className="text-sm text-sky-700 text-center dark:text-sky-200">Waiting for scan...</p>
      </div>
    );
  }

  if (state === 'polling_qr' || state === 'starting') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-950 mb-2 dark:text-slate-100">Connecting...</h3>
        <p className="text-slate-600 dark:text-slate-300">Generating QR code, please wait.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/40">
        <h3 className="text-lg font-semibold text-red-950 mb-2 dark:text-red-100">Something went wrong</h3>
        <p className="text-red-800 mb-4 dark:text-red-200">{error}</p>
        <button
          onClick={() => { setState('idle'); setError(null); }}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-lg font-semibold text-slate-950 mb-2 dark:text-slate-100">Connect WhatsApp</h3>
      <p className="text-slate-700 mb-4 dark:text-slate-300">Link your church WhatsApp number to send messages directly from the hub.</p>
      <button onClick={startAuth} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600">
        Connect WhatsApp
      </button>
    </div>
  );
}
