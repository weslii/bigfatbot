const db = require('../config/database');
const logger = require('../utils/logger');

class AppSettingsService {
  static async get(key) {
    const row = await db.query('app_settings').where({ key }).first();
    return row ? row.value : null;
  }

  static async getBoolean(key, defaultValue) {
    const value = await this.get(key);
    if (!value || typeof value !== 'object') return defaultValue;

    const enabled = value.enabled;
    if (typeof enabled === 'boolean') return enabled;
    return defaultValue;
  }

  static async setBoolean(key, enabled) {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }

    const payload = { enabled };
    const now = new Date();

    const updated = await db
      .query('app_settings')
      .where({ key })
      .update({ value: payload, updated_at: now });

    if (updated === 0) {
      await db.query('app_settings').insert({ key, value: payload, updated_at: now });
    }

    return payload;
  }

  static async ensureDefaults() {
    try {
      const now = new Date();
      const defaults = [
        { key: 'continuous_notifications_enabled', value: { enabled: true } },
        { key: 'disconnected_error_notifications_enabled', value: { enabled: true } },
        { key: 'email_notifications_enabled', value: { enabled: true } },
        { key: 'telegram_notifications_enabled', value: { enabled: true } },
      ];

      for (const item of defaults) {
        const exists = await db.query('app_settings').where({ key: item.key }).first();
        if (!exists) {
          await db.query('app_settings').insert({
            key: item.key,
            value: item.value,
            updated_at: now
          });
        }
      }
    } catch (err) {
      // If migrations haven't run yet, table may not exist. Don't crash the app.
      logger.warn('AppSettingsService.ensureDefaults failed (continuing):', err.message);
    }
  }
}

module.exports = AppSettingsService;

