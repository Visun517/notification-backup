const Handlebars = require("handlebars");
const logger = require("./logger");

/**
 * TemplateEngine utility.
 * Compiles and interpolates notification titles, bodies, and payloads using Handlebars templates.
 * Includes an in-memory cache of compiled template functions for high-throughput performance.
 */
class TemplateEngine {
  constructor() {
    this.compiledCache = new Map();
  }

  /**
   * Compiles and evaluates a template string against a data context.
   *
   * @param {string} templateStr - The Handlebars template string (e.g. "Hello {{name}}!")
   * @param {Object} [context={}] - Data context (e.g. { name: "Visun" })
   * @returns {string} - Interpolated string
   */
  render(templateStr, context = {}) {
    if (!templateStr || typeof templateStr !== "string") {
      return "";
    }

    // Optimization: Skip compilation if string contains no template delimiters
    if (!templateStr.includes("{{")) {
      return templateStr;
    }

    try {
      let compiled = this.compiledCache.get(templateStr);
      if (!compiled) {
        compiled = Handlebars.compile(templateStr, { noEscape: true });
        this.compiledCache.set(templateStr, compiled);
      }
      return compiled(context || {});
    } catch (err) {
      logger.error(`[TemplateEngine] Template interpolation error: ${err.message}`);
      // Fallback: return the original string so notification delivery is not dropped
      return templateStr;
    }
  }

  /**
   * Evaluates both title and message of a notification payload using the provided or embedded context.
   *
   * @param {Object} payload - Notification data object containing title and message
   * @param {Object} [additionalContext={}] - Extra variables to merge into the context
   * @returns {{ title: string, message: string }}
   */
  renderNotification(payload, additionalContext = {}) {
    const context = {
      ...(payload.data || {}),
      ...(payload.metadata || {}),
      ...(payload.actionData || {}),
      ...additionalContext,
    };

    const renderedTitle = this.render(payload.title, context);
    const renderedMessage = this.render(payload.message || payload.body || "", context);

    return {
      title: renderedTitle,
      message: renderedMessage,
    };
  }

  /**
   * Registers a custom Handlebars helper function.
   * @param {string} name
   * @param {Function} fn
   */
  registerHelper(name, fn) {
    Handlebars.registerHelper(name, fn);
  }

  /**
   * Clears the compiled template cache.
   */
  clearCache() {
    this.compiledCache.clear();
  }
}

// Global default singleton instance
const defaultTemplateEngine = new TemplateEngine();

module.exports = {
  TemplateEngine,
  templateEngine: defaultTemplateEngine,
};
