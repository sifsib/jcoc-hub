# WAHA WhatsApp Server Proxy

This Express service is intended to run on Railway. It proxies Kereke Hub requests to WAHA and exposes the routes the dashboard calls for WhatsApp QR linking, status checks, disconnect, and message sending.

## Environment

Set these variables on Railway:

```bash
WAHA_API_URL=https://your-waha-service-url
WAHA_API_KEY=optional-waha-api-key
RAILWAY_SERVICE_KEY=shared-secret-sent-by-kereke-hub
PORT=3001
```

`RAILWAY_SERVICE_KEY` is optional for local testing. If set, every route except `GET /health` must include `X-Service-Key`.

## Dashboard Routes

```bash
GET  /health
POST /auth/start
GET  /auth/qr?sessionName=tenant-id
GET  /auth/status?sessionName=tenant-id
POST /auth/disconnect
POST /message/send
```

Start a session:

```bash
curl -X POST http://localhost:3001/auth/start \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: shared-secret-sent-by-kereke-hub" \
  -d "{\"sessionName\":\"tenant-id\"}"
```

Get the QR code:

```bash
curl "http://localhost:3001/auth/qr?sessionName=tenant-id" \
  -H "X-Service-Key: shared-secret-sent-by-kereke-hub"
```

Check status:

```bash
curl "http://localhost:3001/auth/status?sessionName=tenant-id" \
  -H "X-Service-Key: shared-secret-sent-by-kereke-hub"
```

Send a message:

```bash
curl -X POST http://localhost:3001/message/send \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: shared-secret-sent-by-kereke-hub" \
  -d "{\"sessionName\":\"tenant-id\",\"phone\":\"27123456789\",\"message\":\"Hello from Kereke Hub\"}"
```

## Local Run

Install the subproject dependencies:

```bash
npm install
```

Start the proxy:

```bash
npm start
```

Run the focused tests:

```bash
node --test index.test.js
```

## Notes

Kereke Hub should point `RAILWAY_WHATSAPP_URL` at this service URL. If `RAILWAY_SERVICE_KEY` is set here, set the same value in the Kereke Hub app environment.
