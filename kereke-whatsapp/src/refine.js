// src/refine.js - GPT-5.5 message refinement
//
// Churches draft announcements in a hurry. This cleans them up before they go
// out to hundreds of people. It also solves a hard platform constraint: Meta
// forbids newlines inside template parameters, so the model is instructed to
// return ONE flowing paragraph that survives that restriction intact.

import OpenAI from 'openai';
import { config, assertOpenAIConfigured } from './config.js';
import { LIMITS } from './templates.js';

let client = null;

function getClient() {
  assertOpenAIConfigured();
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

const TONES = {
  warm: 'warm and pastoral',
  formal: 'formal and respectful',
  urgent: 'clear and urgent, without causing alarm',
  celebratory: 'joyful and celebratory',
};

function systemPrompt(tone, churchName) {
  return [
    'You refine WhatsApp announcements for South African churches sending to their congregations.',
    '',
    'Rules you must follow exactly:',
    `- Return ONE single paragraph. Never use line breaks, bullet points, tabs, or markdown. WhatsApp template variables reject newline characters and the message will fail to send.`,
    `- Stay under ${LIMITS.message} characters. Aim for 300-500.`,
    '- Preserve every concrete fact: dates, times, venues, names, amounts. Never invent, add, or change them.',
    '- If a detail is clearly missing (for example a time or venue), leave it out rather than guessing.',
    `- Tone: ${TONES[tone] ?? TONES.warm}.`,
    '- Write in the language the draft is written in. South African English spelling where English.',
    '- Do not add a greeting naming the church, and do not add a sign-off or signature. Both are added automatically around your text.',
    '- Do not use emoji unless the original draft used them.',
    '',
    churchName ? `The message is from ${churchName}.` : '',
    '',
    'Return only the refined message text. No preamble, no quotes, no explanation.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Refine a draft. Returns the refined text plus the original so the dashboard
 * can offer an undo.
 */
export async function refineMessage({ draft, tone = 'warm', churchName = null }) {
  if (!draft || !String(draft).trim()) {
    const error = new Error('Draft message is required.');
    error.httpStatus = 400;
    throw error;
  }

  const openai = getClient();

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: systemPrompt(tone, churchName) },
        { role: 'user', content: String(draft).trim() },
      ],
      max_completion_tokens: 1000,
    });
  } catch (err) {
    console.error('[REFINE] OpenAI call failed:', err.message);
    const error = new Error(`Could not refine the message: ${err.message}`);
    error.httpStatus = err.status && err.status < 500 ? 400 : 502;
    throw error;
  }

  const raw = completion.choices?.[0]?.message?.content ?? '';

  // Belt and braces: the model is told not to emit newlines, but a failed send
  // to a whole congregation is not an acceptable way to find out it did.
  const refined = raw
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

  if (!refined) {
    const error = new Error('The model returned an empty message. Try rephrasing your draft.');
    error.httpStatus = 502;
    throw error;
  }

  return {
    original: String(draft).trim(),
    refined,
    tone,
    model: config.openai.model,
    characters: refined.length,
    withinLimit: refined.length <= LIMITS.message,
  };
}

export const availableTones = Object.keys(TONES);
