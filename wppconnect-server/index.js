const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// WAHA API URL (running separately via Docker)
const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3000';
const WAHA_API_KEY = process.env.WAHA_API_KEY || 'c626b2a4259c4478a12f8978246ca936';
const PORT = process.env.PORT || 3001;

// Axios instance with WAHA API key
const wahaClient = axios.create({
  baseURL: WAHA_API_URL,
  headers: {
    'X-API-Key': WAHA_API_KEY
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check WAHA connection
app.get('/waha/health', async (req, res) => {
  try {
    const response = await wahaClient.get('/health');
    res.json({ waha: response.data });
  } catch (error) {
    res.status(503).json({ error: 'WAHA API not reachable', details: error.message });
  }
});

// Get sessions from WAHA
app.get('/sessions', async (req, res) => {
  try {
    const response = await wahaClient.get('/api/sessions');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a session
app.post('/session/start', async (req, res) => {
  try {
    const { sessionName } = req.body;

    if (!sessionName) {
      return res.status(400).json({ error: 'sessionName is required' });
    }

    console.log(`Starting session: ${sessionName}`);

    const response = await wahaClient.post('/api/sessions/start', {
      name: sessionName
    });

    res.json({
      message: 'Session started',
      sessionName,
      data: response.data
    });

  } catch (error) {
    console.error('Error starting session:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get session status
app.get('/session/:sessionName', async (req, res) => {
  try {
    const { sessionName } = req.params;
    const response = await wahaClient.get(`/api/sessions/${sessionName}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
app.post('/message/send', async (req, res) => {
  try {
    const { sessionName, phone, message } = req.body;

    if (!sessionName || !phone || !message) {
      return res.status(400).json({
        error: 'sessionName, phone, and message are required'
      });
    }

    console.log(`Sending message via ${sessionName} to ${phone}`);

    // WAHA expects phone without + and with @c.us suffix
    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

    const response = await wahaClient.post('/api/sendText', {
      session: sessionName,
      chatId: chatId,
      text: message
    });

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('Error sending message:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Stop a session
app.post('/session/:sessionName/stop', async (req, res) => {
  try {
    const { sessionName } = req.params;

    const response = await wahaClient.post('/api/sessions/stop', {
      name: sessionName
    });

    res.json({
      message: 'Session stopped',
      data: response.data
    });

  } catch (error) {
    console.error('Error stopping session:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`WAHA proxy server running on http://localhost:${PORT}`);
  console.log(`Forwarding requests to WAHA at ${WAHA_API_URL}`);
  console.log('\nEndpoints:');
  console.log('  GET /health - Health check');
  console.log('  GET /waha/health - Check WAHA connection');
  console.log('  POST /session/start - Start a WhatsApp session');
  console.log('  POST /message/send - Send a message');
  console.log('  GET /session/:sessionName - Check session status');
  console.log('  GET /sessions - List all sessions');
  console.log('  POST /session/:sessionName/stop - Stop a session');
});
