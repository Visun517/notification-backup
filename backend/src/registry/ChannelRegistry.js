const logger = require("../utils/logger");

/**
 * ChannelRegistry (Factory / Registry Pattern).
 * Dynamically registers, resolves, and manages notification channel providers.
 */
class ChannelRegistry {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Registers a channel provider.
   * @param {Object} provider - An instance implementing IChannelProvider
   */
  registerProvider(provider) {
    if (!provider || !provider.channelName) {
      throw new Error("Invalid provider: Must have a defined 'channelName'.");
    }

    if (typeof provider.send !== "function") {
      throw new Error(
        `Invalid provider '${provider.channelName}': Must implement the 'send()' method.`,
      );
    }

    this.providers.set(provider.channelName, provider);
    logger.info(`🔌 [ChannelRegistry] Registered provider for channel: ${provider.channelName}`);
  }

  /**
   * Retrieves a registered provider by channel name.
   * @param {string} channelName
   * @returns {Object|null}
   */
  getProvider(channelName) {
    return this.providers.get(channelName) || null;
  }

  /**
   * Checks if a provider exists for the specified channel name.
   * @param {string} channelName
   * @returns {boolean}
   */
  hasProvider(channelName) {
    return this.providers.has(channelName);
  }

  /**
   * Returns all registered provider instances.
   * @returns {Array<Object>}
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Returns a list of all currently registered channel names.
   * @returns {Array<string>}
   */
  getAvailableChannels() {
    return Array.from(this.providers.keys());
  }

  /**
   * Unregisters a provider by channel name.
   * @param {string} channelName
   */
  unregisterProvider(channelName) {
    this.providers.delete(channelName);
    logger.info(`🔌 [ChannelRegistry] Unregistered provider for channel: ${channelName}`);
  }
}

// Global default singleton registry instance
const defaultRegistry = new ChannelRegistry();

module.exports = {
  ChannelRegistry,
  channelRegistry: defaultRegistry,
};
