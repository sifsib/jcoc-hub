// app/api/whatsapp/route.ts - Add to kereke-hub

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import WhatsAppService from '../../../lib/services/whatsappService';
import { adminAuth } from '@/lib/firebase-admin';

const RAILWAY_BASE_URL = process.env.RAILWAY_WHATSAPP_URL!;
const RAILWAY_SERVICE_KEY = process.env.RAILWAY_SERVICE_KEY!;

async function getServiceForRequest(req: NextRequest): Promise<WhatsAppService> {
  const authToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!authToken) {
    throw new Error('No auth token');
  }

  const decodedToken = await adminAuth.verifyIdToken(authToken);
  const uid = decodedToken.uid;

  const db = getFirestore();
  const userDoc = await db.collection('users').doc(uid).get();
  const tenantId = userDoc.data()?.tenantId;

  if (!tenantId) {
    throw new Error('No tenant associated with this user');
  }

  return new WhatsAppService(RAILWAY_BASE_URL, RAILWAY_SERVICE_KEY, tenantId);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...data } = body;
    const whatsapp = await getServiceForRequest(req);

    switch (action) {
      case 'start-auth':
        return NextResponse.json(await whatsapp.startAuth());

      case 'send-message':
        return NextResponse.json(await whatsapp.sendMessage(data.phoneNumber, data.message));

      case 'disconnect':
        return NextResponse.json(await whatsapp.disconnect());

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('WhatsApp API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action');
    const whatsapp = await getServiceForRequest(req);

    switch (action) {
      case 'qr':
        return NextResponse.json(await whatsapp.getQRCode());

      case 'status':
        return NextResponse.json(await whatsapp.getStatus());

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    // Surface 404 from Railway (QR not ready yet) cleanly
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('404') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
