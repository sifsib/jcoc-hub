# WAHA WhatsApp Server Proxy

A simple Express server that proxies to WAHA (WhatsApp HTTP API) for session management and message sending.

## Prerequisites

You need WAHA running locally. Install Docker, then run:

```bash
docker run -it -p 3000:3000 devlikeapro/waha:latest
```

This starts WAHA on port 3000. Leave it running in a separate terminal.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the proxy server:
```bash
npm start
```

The proxy will run on `http://localhost:3001` and forward requests to WAHA at `http://localhost:3000`.

## How It Works

WAHA wraps WhatsApp Web and exposes HTTP endpoints. Our Express proxy:
1. Receives requests from Vercel (in production)
2. Forwards them to WAHA
3. Returns responses back to the client

## Testing

### 1. Check Proxy Health
```bash
curl http://localhost:3001/health
```

### 2. Check WAHA Connection
```bash
curl http://localhost:3001/waha/health
```

If this fails, WAHA isn't running or isn't reachable.

### 3. Start a Session
```bash
curl -X POST http://localhost:3001/session/start \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "kerekehub"}'
```

WAHA will generate a QR code. You'll see it in the WAHA terminal. Scan it with your WhatsApp phone.

### 4. Check Session Status
```bash
curl http://localhost:3001/session/kerekehub
```

### 5. Send a Test Message
Once authenticated:
```bash
curl -X POST http://localhost:3001/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "kerekehub",
    "phone": "27123456789",
    "message": "Hello from WAHA!"
  }'
```

### 6. List Sessions
```bash
curl http://localhost:3001/sessions
```

### 7. Stop a Session
```bash
curl -X POST http://localhost:3001/session/kerekehub/stop
```

## Troubleshooting

- **WAHA health check fails:** Make sure Docker container is running
- **Port 3000 in use:** Change WAHA port or stop conflicting process
- **"Module not found":** Run `npm install` again
- **Phone number format:** Use without + (e.g., 27123456789 for South Africa)

## Next Steps

Once this works locally:
1. Deploy WAHA to Hetzner VPS (via Docker)
2. Deploy this proxy to a Node.js host (or Vercel as a function)
3. Update Vercel routes to call this proxy instead of Evolution API
