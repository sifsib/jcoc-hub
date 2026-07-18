// scripts/provision-templates.mjs
//
// Creates (or re-submits) the shared Kerekehub templates on the Meta WABA.
// Run once at setup, and again whenever a template body changes - Meta treats
// an edited body as a new submission that must be re-approved.
//
//   node scripts/provision-templates.mjs --list
//   node scripts/provision-templates.mjs --status
//   node scripts/provision-templates.mjs --create --header-handle <HANDLE>
//   node scripts/provision-templates.mjs --create --only announcement --header-handle <HANDLE>
//
// The header handle is Meta's reference to an example banner image, required
// because every template here has an IMAGE header. Get one with the Kapso
// skill's uploader:
//
//   node scripts/upload-template-header-handle.mjs \
//     --phone-number-id <ID> --file ./banner-example.jpg
//
// Any 1024x512-ish JPEG/PNG works - it is only shown to Meta's reviewer, not
// to congregants. Each church's real banner is supplied per send.

import { config } from '../src/config.js';
import { createTemplate, listTemplates } from '../src/kapso.js';
import { TEMPLATES, buildTemplateDefinition } from '../src/templates.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

const wabaId = value('--business-account-id') ?? config.kapso.businessAccountId;

function requireWaba() {
  if (!wabaId) {
    console.error('Missing WABA id. Set KAPSO_BUSINESS_ACCOUNT_ID or pass --business-account-id.');
    console.error('Find it with: kapso whatsapp numbers resolve --phone-number "<number>" --output json');
    process.exit(1);
  }
  return wabaId;
}

const selected = () => {
  const only = value('--only');
  const keys = only ? only.split(',').map((k) => k.trim()) : Object.keys(TEMPLATES);
  for (const key of keys) {
    if (!TEMPLATES[key]) {
      console.error(`Unknown template "${key}". Available: ${Object.keys(TEMPLATES).join(', ')}`);
      process.exit(1);
    }
  }
  return keys;
};

async function doList() {
  for (const key of selected()) {
    const definition = buildTemplateDefinition(key);
    console.log(`\n─── ${key} (${definition.name}) ─── ${definition.category}`);
    console.log(JSON.stringify(definition, null, 2));
  }
}

async function doStatus() {
  const id = requireWaba();
  const response = await listTemplates(id, { limit: '100' });
  const byName = new Map((response?.data ?? []).map((t) => [t.name, t]));

  console.log('\nTemplate                        Status      Category');
  console.log('─'.repeat(60));
  for (const key of selected()) {
    const { name } = TEMPLATES[key];
    const found = byName.get(name);
    console.log(
      `${name.padEnd(32)}${(found?.status ?? 'NOT CREATED').padEnd(12)}${found?.category ?? ''}`
    );
    if (found?.status === 'REJECTED' && found?.rejected_reason) {
      console.log(`  ↳ reason: ${found.rejected_reason}`);
    }
  }
  console.log('');
}

async function doCreate() {
  const id = requireWaba();
  const handle = value('--header-handle');

  if (!handle) {
    console.error('Missing --header-handle. Every template has an IMAGE header, so Meta');
    console.error('requires an example image handle at creation time. See the header of');
    console.error('this file for how to produce one.');
    process.exit(1);
  }

  for (const key of selected()) {
    const definition = buildTemplateDefinition(key);
    // Swap the placeholder for the real uploaded handle.
    definition.components = definition.components.map((component) =>
      component.type === 'HEADER'
        ? { ...component, example: { header_handle: [handle] } }
        : component
    );

    try {
      const result = await createTemplate(id, definition);
      console.log(`✓ ${definition.name}: ${result.status ?? 'submitted'} (id ${result.id ?? '?'})`);
    } catch (err) {
      console.error(`✗ ${definition.name}: ${err.message}`);
      if (err.metaCode) console.error(`  meta code ${err.metaCode}`);
    }
  }

  console.log('\nTemplates are submitted for Meta review. Check progress with --status.');
  console.log('Approval usually takes minutes but can take up to 24 hours.');
}

if (has('--list')) await doList();
else if (has('--status')) await doStatus();
else if (has('--create')) await doCreate();
else {
  console.log('Usage: node scripts/provision-templates.mjs [--list | --status | --create --header-handle <HANDLE>]');
  console.log('       optional: --only <key,key>  --business-account-id <id>');
  console.log(`\nTemplates: ${Object.keys(TEMPLATES).join(', ')}`);
}
