// hub: app/api/extract-statement/route.ts
//
// PIECE THREE (server side). Receives a bank statement PDF, sends it to Claude,
// and returns a clean list of transactions: { date, amount, reference }.
// The API key (ANTHROPIC_API_KEY) lives only here on the server, never in the browser.
//
// Auth matches the rest of the app: verify the `session` cookie and require a
// finance-capable role before spending any AI credit.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const maxDuration = 60; // AI read can take a while on a long statement

// Cheapest capable model. If a tricky bank layout reads poorly, swap this to
// 'claude-sonnet-4-6' for better accuracy at a slightly higher cost.
const MODEL = 'claude-haiku-4-5-20251001';

const FINANCE_ROLES = ['owner', 'admin', 'finance'];

type ExtractedRow = { date: string; amount: number; reference: string };

export async function POST(req: NextRequest) {
  // 1. Who is calling?
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const userDoc = await adminDb.collection('users').doc(uid).get();
  const role = userDoc.data()?.role;
  if (!role || !FINANCE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Not authorised for finance.' }, { status: 403 });
  }

  // 2. API key present?
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI key not configured on the server. Add ANTHROPIC_API_KEY in Vercel.' },
      { status: 500 },
    );
  }

  // 3. Read the uploaded PDF (sent as base64 in JSON).
  let base64: string;
  try {
    const body = await req.json();
    base64 = body.pdfBase64;
    if (!base64 || typeof base64 !== 'string') throw new Error('no pdf');
  } catch {
    return NextResponse.json({ error: 'No PDF received.' }, { status: 400 });
  }

  // 4. Ask Claude to read the statement and return JSON only.
  const prompt = `You are reading a South African bank statement PDF. Extract every money transaction line.

Return ONLY a JSON array, no prose, no code fences. Each item must be:
{"date": "YYYY-MM-DD", "amount": number, "reference": "string"}

Rules:
- "amount" is POSITIVE for money coming IN (credits, deposits) and NEGATIVE for money going OUT (debits, payments, fees).
- "reference" is the transaction description or narrative as printed.
- Convert any date format to YYYY-MM-DD. If the year is not on the line, infer it from the statement period.
- SKIP opening balance, closing balance, brought-forward, carried-forward and running-balance-only lines. Only real transactions.
- If you cannot read any transactions, return [].`;

  let aiResponse: Response;
  try {
    aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Anthropic request failed:', err);
    return NextResponse.json({ error: 'Could not reach the AI service.' }, { status: 502 });
  }

  if (!aiResponse.ok) {
    const detail = await aiResponse.text();
    console.error('Anthropic error:', aiResponse.status, detail);
    const friendly =
      aiResponse.status === 401
        ? 'The AI key was rejected. Check ANTHROPIC_API_KEY in Vercel.'
        : aiResponse.status === 400
        ? 'The AI could not process that PDF. Make sure it is a readable (not scanned) statement.'
        : 'The AI service returned an error. Please try again.';
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  // 5. Pull the text out and parse the JSON.
  let rows: ExtractedRow[] = [];
  try {
    const data = await aiResponse.json();
    const text: string = data?.content?.[0]?.text ?? '';
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    const jsonSlice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
    const parsed = JSON.parse(jsonSlice);
    if (Array.isArray(parsed)) {
      rows = parsed
        .filter((r) => r && r.date && typeof r.amount === 'number')
        .map((r) => ({
          date: String(r.date),
          amount: Number(r.amount),
          reference: String(r.reference ?? '').trim(),
        }));
    }
  } catch (err) {
    console.error('Could not parse AI output:', err);
    return NextResponse.json(
      { error: 'The AI replied in an unexpected format. Please try again.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ rows });
}
