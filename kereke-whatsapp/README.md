# Kereke WhatsApp Service (Kapso)

Node.js service that sends WhatsApp messages for every Kereke Hub church through
**one central Kerekehub number**, via [Kapso](https://kapso.ai)'s Meta Cloud API
proxy. Runs on Render.

Replaces the previous Baileys service, which drove a separate real WhatsApp
account per church via QR pairing.

---

## Read this first: what changed and what you cannot do

The old Baileys service was an *unofficial* client. It could send any text to
anyone at any time. The Meta Cloud API cannot, and no amount of code changes
that:

| | Baileys (old) | Cloud API via Kapso (now) |
|---|---|---|
| Free-form text to anyone | Yes | **No** |
| Free-form text within 24h of them messaging you | Yes | Yes |
| Church-initiated broadcast | Any text | **Pre-approved template only** |
| Line breaks in a broadcast message | Yes | **No** (see below) |
| Ban risk | High (unofficial) | Low (official) |

Three consequences shape the whole design:

**1. Broadcasts must use approved templates.** Meta reviews template wording
before it can be sent. So churches do not write free-form broadcasts; they fill
in the variables of a shared template. See [Templates](#templates).

**2. Template variables cannot contain newlines**, tabs, or 4+ consecutive
spaces — Meta rejects the send with a 400. A church's multi-paragraph draft is
flattened into one paragraph (paragraph breaks become " — ") and the API returns
a warning saying so. This is why [message refinement](#ai-message-refinement)
exists: GPT-5.5 is instructed to return a single well-formed paragraph.

**3. The number is shared, so quality is shared.** Meta scores each phone number
on blocks and spam reports. One church spamming degrades delivery for *every*
church, and a ban takes down the whole platform. Opt-outs are therefore enforced
in this service, not left to the dashboard.

---

## Architecture

```
Next.js app (kereke-hub)
  │  Firebase auth → resolves tenantId
  │  X-Service-Key + X-Tenant-Id
  ▼
this service ──────────────► Kapso ──► Meta Cloud API ──► congregants
  │                            ▲
  │  jobs, consent, branding   │ webhooks (delivery status, opt-outs)
  ▼                            │
Firestore ─────────────────────┘
```

Churches are identified inside the message, not by the sender number:

- **Banner** — the church's image, sent as the template's IMAGE header
- **Signature** — the church's sign-off, the last line of the body

Both come from `tenants/{tenantId}/settings/whatsapp`.

### Firestore collections

| Path | Purpose |
|---|---|
| `tenants/{id}/settings/whatsapp` | `churchName`, `signature`, `bannerUrl` |
| `tenants/{id}/whatsappBroadcasts/{jobId}` | Broadcast job + counts |
| `tenants/{id}/whatsappBroadcasts/{jobId}/recipients/{msisdn}` | Per-recipient status |
| `tenants/{id}/whatsappOptOuts/{msisdn}` | Opted out of this church |
| `whatsappGlobalOptOuts/{msisdn}` | Opted out of the whole platform |

**Required composite indexes** (collection group `recipients`):

- `msisdn` ASC, `sentAt` DESC — attributes a typed "STOP" to the right church
- `messageId` ASC — routes delivery-status webhooks to the right recipient row

Both failures are caught and logged rather than crashing, but until the indexes
exist a typed STOP becomes a *global* opt-out (over-suppressing, deliberately)
and delivery receipts are dropped.

---

## Templates

Defined in `src/templates.js`, created once on the Kerekehub WABA and shared by
every church.

| Key | Meta name | Category | Variables |
|---|---|---|---|
| `announcement` | `kereke_announcement` | MARKETING | church_name, message, signature |
| `service_reminder` | `kereke_service_reminder` | UTILITY | + event_name, event_when |
| `prayer_request` | `kereke_prayer_request` | UTILITY | church_name, message, signature |

Each renders as:

```
[ church banner image ]
📢 Announcement from *Grace Family Church*

Sunday service moves to 9am from this weekend.

_Pastor Thabo Mokoena | Grace Family Church_
Sent via Kereke Hub
[ Stop messages ]
```

`Sent via Kereke Hub` is a static FOOTER — Meta forbids variables there.
`Stop messages` is a quick-reply button whose payload carries `optout:{tenantId}`,
which is how a shared number knows *which* church an opt-out refers to.

Categories are deliberate: general church news is MARKETING. Labelling it
UTILITY to dodge Meta's marketing limits is a common cause of template rejection
and quality penalties.

### Provisioning

```bash
node scripts/provision-templates.mjs --list      # preview the definitions
node scripts/provision-templates.mjs --create --header-handle <HANDLE>
node scripts/provision-templates.mjs --status    # check approval
```

Every template has an IMAGE header, so Meta needs an example image handle at
creation time. Produce one with the Kapso skill's uploader:

```bash
node scripts/upload-template-header-handle.mjs --phone-number-id <ID> --file ./banner-example.jpg
```

The example image is only shown to Meta's reviewer. Each church's real banner is
supplied per send.

**Editing a template body re-submits it for approval.** Approval usually takes
minutes, occasionally 24 hours.

---

## API

All endpoints except `/health`, `/debug` and `/webhooks/kapso` require:

```
X-Service-Key: <SERVICE_KEY>
X-Tenant-Id:   <firestore tenant id>
```

### Branding

```http
GET  /branding
PUT  /branding      { churchName, signature, bannerUrl }
```

`bannerUrl` must be public **https** — Meta fetches it server-side, so signed or
expiring URLs will fail the send.

### AI message refinement

```http
GET  /message/tones
POST /message/refine   { draft, tone?, churchName? }
```

Tones: `warm` (default), `formal`, `urgent`, `celebratory`. Returns `original`
and `refined` so the dashboard can offer an undo. Returns **503** until
`OPENAI_API_KEY` is set.

### Sending

```http
POST /message/send   { to, message, templateKey?, bannerUrl?, extraValues? }
POST /broadcast      { recipients[], message, templateKey?, extraValues?, createdBy? }
GET  /broadcast      ?limit=25
GET  /broadcast/:jobId
```

`/broadcast` returns **202** immediately with a `jobId`; poll `/broadcast/:jobId`
for progress. Before queueing it normalises numbers, drops duplicates and
suppresses opt-outs, reporting all three in `counts`:

```json
{
  "jobId": "abc123",
  "status": "queued",
  "counts": { "requested": 412, "invalid": 3, "suppressed": 9, "queued": 400 },
  "invalidNumbers": ["not-a-number"],
  "warnings": ["Line breaks in \"message\" were removed - WhatsApp does not allow them inside template variables."]
}
```

For `service_reminder`, pass `extraValues: { event_name, event_when }`.

### Consent

```http
POST /consent/check     { recipients[] }   → { allowed[], suppressed[] }
POST /consent/opt-out   { phone }
POST /consent/opt-in    { phone }
```

### Retired

`POST /auth/start`, `GET /auth/qr`, `POST /auth/disconnect` return **410 Gone** —
there is no per-church session to pair. `GET /auth/status` still works and
reports whether branding is configured.

---

## Phone numbers

Congregant numbers arrive from spreadsheets in every format. `src/phone.js`
normalises to E.164 digits using `DEFAULT_COUNTRY_CODE` (27 = South Africa):

| Input | Output |
|---|---|
| `0821234567` | `27821234567` |
| `082 123 4567` | `27821234567` |
| `+27821234567` | `27821234567` |
| `821234567` | `27821234567` |
| `rubbish`, `123` | rejected |

Duplicates across formats are collapsed, so a congregant on two lists is
messaged once.

---

## Environment

See `.env.example`. Required: `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`,
`FIREBASE_SERVICE_ACCOUNT_KEY`, `SERVICE_KEY`.

`KAPSO_WEBHOOK_SECRET` is required for opt-outs to work — the webhook route
**fails closed** and rejects everything without it, since an unverified webhook
could forge an opt-out for any number.

Find your ids with:

```bash
kapso whatsapp numbers list --output json
kapso whatsapp numbers resolve --phone-number "<display-number>" --output json
```

### Webhook registration

Point a **phone-number** webhook (not a project webhook — message events are
phone-number scoped) at `https://<render-url>/webhooks/kapso`:

```bash
node scripts/create.js --phone-number-id <ID> \
  --url https://<render-url>/webhooks/kapso \
  --events whatsapp.message.received,whatsapp.message.sent,whatsapp.message.delivered,whatsapp.message.read,whatsapp.message.failed \
  --payload-version v2
```

---

## Local development

```bash
npm install
npm test          # pure logic: phone normalisation + template building
npm run dev
```

`npm test` needs no credentials. Running the server needs a real Firebase
service account.

---

## Compliance (POPIA)

Churches must have consent before messaging congregants; this service enforces
the back half of that:

- Every message carries a one-tap **Stop messages** button
- Typed `STOP` / `unsubscribe` (and common isiZulu/Afrikaans equivalents) opt out
- Opt-outs are checked before every send and cannot be bypassed by the dashboard
- A typed STOP that cannot be attributed to a church becomes a **global** opt-out

The dashboard still needs to capture and record consent at the point a
congregant's number is added. That is not implemented here.
