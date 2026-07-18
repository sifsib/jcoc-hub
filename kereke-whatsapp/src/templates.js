// src/templates.js - the shared Kerekehub template catalogue
//
// Every church broadcasts through ONE central WhatsApp number, so churches are
// identified inside the message rather than by the sender. Each template has:
//
//   HEADER  IMAGE     -> the church's banner (per-church image link at send time)
//   BODY              -> church name + message + signature, as named variables
//   FOOTER            -> static "Sent via Kereke Hub" (Meta forbids variables here)
//   BUTTONS QUICK_REPLY -> opt-out, carrying the tenant id in its payload
//
// Constraint that shapes everything below: Meta rejects template PARAMETERS
// containing newlines, tabs, or 4+ consecutive spaces, and the fully rendered
// body must stay under 1024 characters. Static newlines belong in the template
// body text (which is why the blank lines below are safe) - never in a value we
// substitute at send time. See sanitiseParam().

export const OPT_OUT_BUTTON_LABEL = 'Stop messages';

const FOOTER_TEXT = 'Sent via Kereke Hub';

// Rendered body must fit 1024 chars including the static scaffolding, so the
// message budget depends on how many other variables a template carries.
// Templates with extra fields override `message` via their own `limits`.
export const LIMITS = {
  churchName: 60,
  message: 700,
  signature: 120,
  eventName: 60,
  eventWhen: 60,
};

/** Effective limit for a parameter, honouring per-template overrides. */
export function limitFor(template, paramName) {
  const key = paramName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return template?.limits?.[key] ?? LIMITS[key] ?? 200;
}

export const TEMPLATES = {
  announcement: {
    key: 'announcement',
    name: 'kereke_announcement',
    language: 'en',
    // General church news is MARKETING under Meta's rules. Mislabelling it as
    // UTILITY is a common cause of template rejection and quality penalties.
    category: 'MARKETING',
    params: ['church_name', 'message', 'signature'],
    body: '📢 Announcement from *{{church_name}}*\n\n{{message}}\n\n_{{signature}}_',
    examples: {
      church_name: 'Grace Family Church',
      message: 'Our Sunday service moves to 9am from this weekend. Please arrive 15 minutes early for prayer.',
      signature: 'Pastor Thabo Mokoena, Grace Family Church',
    },
  },

  service_reminder: {
    key: 'service_reminder',
    name: 'kereke_service_reminder',
    language: 'en',
    // A reminder for a service the member already signed up to is UTILITY.
    category: 'UTILITY',
    params: ['church_name', 'event_name', 'event_when', 'message', 'signature'],
    // Two extra variables eat into the 1024-char body budget, so the free-text
    // message gets less room here than in a plain announcement.
    limits: { message: 600 },
    body: '*{{church_name}}*\n\nReminder: *{{event_name}}* is on {{event_when}}.\n\n{{message}}\n\n_{{signature}}_',
    examples: {
      church_name: 'Grace Family Church',
      event_name: 'Midweek Bible Study',
      event_when: 'Wednesday at 18:30',
      message: 'We are continuing in the book of James. Bring a friend.',
      signature: 'Pastor Thabo Mokoena, Grace Family Church',
    },
  },

  prayer_request: {
    key: 'prayer_request',
    name: 'kereke_prayer_request',
    language: 'en',
    category: 'UTILITY',
    params: ['church_name', 'message', 'signature'],
    body: '🙏 Prayer request from *{{church_name}}*\n\n{{message}}\n\n_{{signature}}_',
    examples: {
      church_name: 'Grace Family Church',
      message: 'Please keep the Dlamini family in your prayers this week following their loss.',
      signature: 'Pastor Thabo Mokoena, Grace Family Church',
    },
  },

  // Sent by the scheduled daily-summary function to the church's own admin,
  // not to congregants - hence no banner. Each figure is its own variable so
  // the line breaks live in the template body, where Meta allows them.
  daily_summary: {
    key: 'daily_summary',
    name: 'kereke_daily_summary',
    language: 'en',
    category: 'UTILITY',
    header: null,
    params: [
      'church_name',
      'summary_date',
      'new_members',
      'new_visitors',
      'payment_count',
      'payment_total',
      'follow_ups',
    ],
    limits: { summaryDate: 40, newMembers: 12, newVisitors: 12, paymentCount: 12, paymentTotal: 20, followUps: 12 },
    body:
      '*{{church_name}}* daily summary for {{summary_date}}\n\n'
      + 'New members: {{new_members}}\n'
      + 'New visitors: {{new_visitors}}\n'
      + 'Payments: {{payment_count}} (R{{payment_total}})\n'
      + 'Follow-ups tomorrow: {{follow_ups}}',
    examples: {
      church_name: 'Grace Family Church',
      summary_date: 'Monday, 14 July 2026',
      new_members: '3',
      new_visitors: '5',
      payment_count: '12',
      payment_total: '4 350.00',
      follow_ups: '2',
    },
  },
};

export function getTemplate(key) {
  const template = TEMPLATES[key];
  if (!template) {
    const error = new Error(
      `Unknown template "${key}". Available: ${Object.keys(TEMPLATES).join(', ')}`
    );
    error.httpStatus = 400;
    throw error;
  }
  return template;
}

/**
 * Make a value safe to use as a template parameter.
 *
 * Meta rejects newlines, tabs and 4+ consecutive spaces in parameters, so a
 * church's multi-paragraph draft has to be flattened into one run of text.
 * Returns the cleaned value plus whether we had to destroy formatting, so the
 * caller can warn the user.
 */
export function sanitiseParam(value, maxLength) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  // Paragraph breaks read better as a separator than a plain space.
  const collapsed = raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, ' — ')
    .replace(/[\n\t]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

  const flattened = collapsed !== raw.trim();
  const truncated = collapsed.length > maxLength;
  const text = truncated ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…` : collapsed;

  return { text, flattened, truncated };
}

/**
 * Build the Meta `components` array for a send, given a template key and the
 * church's branding + message values.
 */
export function buildComponents(templateKey, values, { bannerUrl, tenantId }) {
  const template = getTemplate(templateKey);
  const warnings = [];
  const parameters = [];

  for (const paramName of template.params) {
    const maxLength = limitFor(template, paramName);
    const provided = values[paramName];

    if (provided === undefined || provided === null || !String(provided).trim()) {
      const error = new Error(`Missing value for template parameter "${paramName}".`);
      error.httpStatus = 400;
      throw error;
    }

    const { text, flattened, truncated } = sanitiseParam(provided, maxLength);
    if (flattened) {
      warnings.push(
        `Line breaks in "${paramName}" were removed - WhatsApp does not allow them inside template variables.`
      );
    }
    if (truncated) {
      warnings.push(`"${paramName}" was shortened to ${maxLength} characters.`);
    }

    parameters.push({ type: 'text', parameter_name: paramName, text });
  }

  const components = [];

  // `header: null` templates (e.g. daily_summary) have no image header at all,
  // so sending header parameters would be rejected by Meta.
  const wantsHeader = template.header !== null;

  if (wantsHeader && bannerUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: bannerUrl } }],
    });
  }

  components.push({ type: 'body', parameters });

  // Encode the tenant in the opt-out payload. With one shared number we would
  // otherwise not know which church a "stop" refers to.
  components.push({
    type: 'button',
    sub_type: 'quick_reply',
    index: '0',
    parameters: [{ type: 'payload', payload: `optout:${tenantId}` }],
  });

  return { template, components, warnings };
}

/** Full send payload for the Meta proxy. */
export function buildTemplatePayload(templateKey, values, { to, bannerUrl, tenantId }) {
  const { template, components, warnings } = buildComponents(templateKey, values, {
    bannerUrl,
    tenantId,
  });

  return {
    payload: {
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components,
      },
    },
    warnings,
  };
}

/**
 * Meta template-creation payload, used by scripts/provision-templates.mjs.
 * Templates are created once for the Kerekehub WABA and shared by all churches.
 */
export function buildTemplateDefinition(templateKey) {
  const template = getTemplate(templateKey);

  const header =
    template.header === null
      ? []
      : [
          {
            type: 'HEADER',
            format: 'IMAGE',
            example: {
              header_handle: ['<UPLOAD_HANDLE>'], // replaced by the provisioning script
            },
          },
        ];

  return {
    name: template.name,
    language: template.language,
    category: template.category,
    parameter_format: 'NAMED',
    components: [
      ...header,
      {
        type: 'BODY',
        text: template.body,
        example: {
          body_text_named_params: template.params.map((param) => ({
            param_name: param,
            example: template.examples[param],
          })),
        },
      },
      { type: 'FOOTER', text: FOOTER_TEXT },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: OPT_OUT_BUTTON_LABEL }],
      },
    ],
  };
}
