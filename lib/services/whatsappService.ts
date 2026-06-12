// lib/services/whatsappService.ts - Add to kereke-hub

class WhatsAppService {
  private railwayBaseUrl: string;
  private serviceKey: string;
  private tenantId: string;

  constructor(railwayBaseUrl: string, serviceKey: string, tenantId: string) {
    this.railwayBaseUrl = railwayBaseUrl;
    this.serviceKey = serviceKey;
    this.tenantId = tenantId;
  }

  private async call(method: string, endpoint: string, body?: Record<string, unknown>) {
    const url = `${this.railwayBaseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': this.serviceKey,
        'X-Tenant-Id': this.tenantId
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      const message = err.error || `HTTP ${response.status}`;
      const error = new Error(message) as Error & { httpStatus: number };
      error.httpStatus = response.status;
      throw error;
    }

    return response.json();
  }

  async startAuth() {
    return this.call('POST', '/auth/start');
  }

  async getQRCode() {
    return this.call('GET', '/auth/qr');
  }

  async getStatus() {
    return this.call('GET', '/auth/status');
  }

  async sendMessage(phoneNumber: string, message: string) {
    return this.call('POST', '/message/send', { phoneNumber, message });
  }

  async disconnect() {
    return this.call('POST', '/auth/disconnect');
  }

  async health() {
    return this.call('GET', '/health');
  }
}

export default WhatsAppService;
