// app/api/demo/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const { churchName, email } = await request.json();

    if (!churchName || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Save the lead directly into a 'demo_requests' collection in Firestore
    const docRef = await adminDb.collection('demo_requests').add({
      churchName,
      email,
      status: 'pending_demo',
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id: docRef.id }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}