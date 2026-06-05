// src/firebaseSession.js - FIXED VERSION
import admin from 'firebase-admin';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.FIREBASE_ENCRYPTION_KEY || 'default-dev-key-change-in-prod';
const ALGORITHM = 'aes-256-cbc';

class FirebaseSessionStore {
  constructor() {
    this.db = null;
  }

  getDb() {
    if (!this.db) {
      this.db = admin.firestore();
    }
    return this.db;
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encryptedText) {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async saveSession(tenantId, sessionData) {
    try {
      const db = this.getDb();
      const encryptedSession = this.encrypt(JSON.stringify(sessionData));
      await db.collection('whatsapp_sessions').doc(tenantId).set({
        encryptedData: encryptedSession,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        tenantId: tenantId
      });
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      throw error;
    }
  }

  async loadSession(tenantId) {
    try {
      const db = this.getDb();
      const doc = await db.collection('whatsapp_sessions').doc(tenantId).get();
      if (!doc.exists) return null;

      const encryptedData = doc.data().encryptedData;
      const decrypted = this.decrypt(encryptedData);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Error loading session:', error);
      return null;
    }
  }

  async deleteSession(tenantId) {
    try {
      const db = this.getDb();
      await db.collection('whatsapp_sessions').doc(tenantId).delete();
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  async updateTenantWhatsAppStatus(tenantId, phoneNumber, isLinked) {
    try {
      const db = this.getDb();
      await db.collection('tenants').doc(tenantId).update({
        whatsapp_linked: isLinked,
        whatsapp_phone: phoneNumber || null,
        whatsapp_linked_at: isLinked ? admin.firestore.FieldValue.serverTimestamp() : null
      });
      return true;
    } catch (error) {
      console.error('Error updating tenant status:', error);
      throw error;
    }
  }
}

export default new FirebaseSessionStore();
