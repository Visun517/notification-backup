/**
 * Interface / Abstract Base Class for Notification Channel Providers (Strategy Pattern).
 * All delivery channels (IN_APP, PUSH, EMAIL, SMS, WEBHOOK) must extend this class.
 */
class IChannelProvider {
  /**
   * @param {string} channelName - Channel identifier (e.g., 'IN_APP', 'PUSH', etc.)
   */
  constructor(channelName) {
    if (this.constructor === IChannelProvider) {
      throw new Error("Cannot instantiate abstract class IChannelProvider directly.");
    }
    if (!channelName) {
      throw new Error("Channel provider must specify a valid channelName.");
    }
    this.channelName = channelName;
  }

  /**
   * Checks whether the provider is configured and available.
   * @returns {boolean}
   */
  isConfigured() {
    return true;
  }

  /**
   * Sends a notification payload to target recipient(s) via this delivery channel.
   *
   * @param {Object} payload - Notification payload (id, title, message, scope, tags, actionUrl, etc.)
   * @param {Object} [recipientMeta] - Contextual data (user details, socket instance, fcm token, etc.)
   * @returns {Promise<{ channel: string, success: boolean, messageId?: string, error?: string }>}
   */
  async send(payload, recipientMeta = {}) {
    throw new Error(`Method 'send()' must be implemented by subclass ${this.constructor.name}.`);
  }
}

module.exports = IChannelProvider;
