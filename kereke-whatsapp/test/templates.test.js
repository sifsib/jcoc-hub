import test from 'node:test';
import assert from 'node:assert/strict';

const { sanitiseParam, buildTemplatePayload, buildTemplateDefinition, TEMPLATES, limitFor } =
  await import('../src/templates.js');

// Meta rejects parameters containing newlines, tabs, or 4+ consecutive spaces.
// These tests exist because violating that rule fails an entire broadcast.

test('flattens newlines and reports that it did', () => {
  const { text, flattened } = sanitiseParam('Line one\nLine two', 500);
  assert.equal(text, 'Line one Line two');
  assert.equal(flattened, true);
});

test('turns paragraph breaks into a readable separator', () => {
  const { text } = sanitiseParam('First para\n\nSecond para', 500);
  assert.equal(text, 'First para — Second para');
});

test('strips tabs and collapses runs of spaces', () => {
  const { text } = sanitiseParam('a\tb     c', 500);
  assert.equal(text, 'a b c');
  assert.ok(!/[\n\t]/.test(text));
  assert.ok(!/ {4,}/.test(text));
});

test('leaves clean single-line text untouched', () => {
  const { text, flattened, truncated } = sanitiseParam('Service moves to 9am.', 500);
  assert.equal(text, 'Service moves to 9am.');
  assert.equal(flattened, false);
  assert.equal(truncated, false);
});

test('truncates past the limit with an ellipsis', () => {
  const { text, truncated } = sanitiseParam('x'.repeat(50), 10);
  assert.equal(truncated, true);
  assert.equal(text.length, 10);
  assert.ok(text.endsWith('…'));
});

test('builds a send payload with banner header, body params and opt-out payload', () => {
  const { payload, warnings } = buildTemplatePayload(
    'announcement',
    {
      church_name: 'Grace Family Church',
      message: 'Sunday service moves to 9am.',
      signature: 'Pastor Thabo',
    },
    { to: '27821234567', bannerUrl: 'https://cdn.example.com/banner.jpg', tenantId: 'tenant-1' }
  );

  assert.equal(payload.type, 'template');
  assert.equal(payload.to, '27821234567');
  assert.equal(payload.template.name, 'kereke_announcement');

  const header = payload.template.components.find((c) => c.type === 'header');
  assert.equal(header.parameters[0].image.link, 'https://cdn.example.com/banner.jpg');

  const body = payload.template.components.find((c) => c.type === 'body');
  assert.deepEqual(
    body.parameters.map((p) => p.parameter_name),
    ['church_name', 'message', 'signature']
  );

  // The tenant must ride along in the opt-out payload: one shared number means
  // a bare "stop" is otherwise unattributable.
  const button = payload.template.components.find((c) => c.type === 'button');
  assert.equal(button.parameters[0].payload, 'optout:tenant-1');

  assert.deepEqual(warnings, []);
});

test('omits the header when a church has no banner', () => {
  const { payload } = buildTemplatePayload(
    'announcement',
    { church_name: 'Church', message: 'Hi', signature: 'Pastor' },
    { to: '27821234567', bannerUrl: null, tenantId: 't1' }
  );
  assert.equal(payload.template.components.find((c) => c.type === 'header'), undefined);
});

test('warns when the church message had formatting stripped', () => {
  const { warnings } = buildTemplatePayload(
    'announcement',
    { church_name: 'Church', message: 'Line one\nLine two', signature: 'Pastor' },
    { to: '27821234567', bannerUrl: null, tenantId: 't1' }
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Line breaks/);
});

test('rejects a missing or blank parameter', () => {
  assert.throws(
    () =>
      buildTemplatePayload(
        'announcement',
        { church_name: 'Church', message: '   ', signature: 'Pastor' },
        { to: '27821234567', tenantId: 't1' }
      ),
    /Missing value for template parameter "message"/
  );
});

test('rejects an unknown template key', () => {
  assert.throws(
    () => buildTemplatePayload('nope', {}, { to: '27821234567', tenantId: 't1' }),
    /Unknown template/
  );
});

test('a headerless template sends no header component even with a banner set', () => {
  const { payload } = buildTemplatePayload(
    'daily_summary',
    {
      church_name: 'Church',
      summary_date: 'Monday, 14 July 2026',
      new_members: '3',
      new_visitors: '5',
      payment_count: '12',
      payment_total: '4 350.00',
      follow_ups: '2',
    },
    { to: '27821234567', bannerUrl: 'https://cdn.example.com/banner.jpg', tenantId: 't1' }
  );
  assert.equal(payload.template.components.find((c) => c.type === 'header'), undefined);
});

test('headerless template definitions omit the HEADER component', () => {
  const definition = buildTemplateDefinition('daily_summary');
  assert.equal(definition.components.find((c) => c.type === 'HEADER'), undefined);
});

test('template definitions declare examples for every named parameter', () => {
  for (const key of Object.keys(TEMPLATES)) {
    const definition = buildTemplateDefinition(key);
    const body = definition.components.find((c) => c.type === 'BODY');
    const declared = body.example.body_text_named_params.map((p) => p.param_name);
    const used = [...body.text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

    assert.deepEqual(declared.sort(), [...new Set(used)].sort(), `${key} example params`);
    for (const param of body.example.body_text_named_params) {
      assert.ok(param.example, `${key}.${param.param_name} needs an example for Meta review`);
    }
  }
});

test('templates keep static text so Meta does not reject an all-variable body', () => {
  for (const key of Object.keys(TEMPLATES)) {
    const body = buildTemplateDefinition(key).components.find((c) => c.type === 'BODY');
    const withoutVars = body.text.replace(/\{\{\w+\}\}/g, '').replace(/[\s*_]/g, '');
    assert.ok(withoutVars.length > 0, `${key} body is entirely variables`);
  }
});

test('worst-case rendered body stays within the 1024 character limit', () => {
  for (const key of Object.keys(TEMPLATES)) {
    const definition = buildTemplateDefinition(key);
    const body = definition.components.find((c) => c.type === 'BODY');
    const rendered = body.text.replace(/\{\{(\w+)\}\}/g, (_, name) =>
      'x'.repeat(limitFor(TEMPLATES[key], name))
    );
    assert.ok(rendered.length <= 1024, `${key} can render ${rendered.length} chars`);
  }
});
