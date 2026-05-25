'use client';

import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAppUser } from '../../../lib/useAppUser';

export default function CommunicationsPage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!appUser) {
      setFeedback('You must be logged in to send a broadcast.');
      return;
    }

    if (!message.trim()) {
      setFeedback('Please enter a message to broadcast.');
      return;
    }

    setIsSubmitting(true);
    setFeedback('');

    try {
      await addDoc(collection(db, 'communications'), {
        tenantId: appUser.tenantId,
        message: message.trim(),
        type: 'whatsapp_broadcast',
        status: 'pending',
        createdAt: serverTimestamp(),
        createdBy: appUser.email,
        targetAudience: 'all_members',
      });

      setFeedback('Broadcast successfully queued.');
      setMessage('');
    } catch (error) {
      console.error('Error queuing broadcast:', error);
      setFeedback('Failed to queue broadcast. Check your console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (userLoading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="spinner !border-emerald-600 !border-t-transparent"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">WhatsApp Broadcast Engine</h1>
        <p className="text-gray-500 text-sm mt-1">Queue a message to be sent to your congregation.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm max-w-2xl">
        <form onSubmit={handleSendBroadcast}>
          <div className="mb-4">
            <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-2">
              Broadcast Message
            </label>
            <textarea
              id="message"
              rows={6}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="Type your message here. It will be sent to all active members."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-400 mt-1">{message.length} characters</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className={`px-6 py-2 rounded-lg text-white text-sm font-semibold ${
                isSubmitting || !message.trim()
                  ? 'bg-emerald-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              } transition-colors`}
            >
              {isSubmitting ? 'Queueing...' : 'Queue Broadcast'}
            </button>

            {feedback && (
              <span
                className={`text-sm font-medium ${
                  feedback.includes('Failed') ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {feedback}
              </span>
            )}
          </div>
        </form>
      </div>

      <div className="max-w-2xl bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <p className="text-xs text-amber-800">
          Messages are queued with a <strong>pending</strong> status. The backend Cloud Function
          picks them up and dispatches via the WhatsApp API. Delivery confirmation updates the
          status to <strong>sent</strong>.
        </p>
      </div>
    </div>
  );
}