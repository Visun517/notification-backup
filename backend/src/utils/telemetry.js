/**
 * Enterprise Telemetry & Prometheus Metrics Service
 * Collects structured metrics and latency timings for async queue and channel dispatches.
 */
class TelemetryService {
  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
    this.initDefaultMetrics();
  }

  initDefaultMetrics() {
    this.counters.set("notifications_enqueued_total", new Map());
    this.counters.set("notifications_dispatched_total", new Map());
    this.counters.set("notifications_failed_total", new Map());
    this.counters.set("notifications_rate_limited_total", new Map());

    // Histograms keep count, sum, and bucket arrays: [10, 50, 100, 250, 500, 1000, 2500, 5000]
    this.histogramBuckets = [10, 50, 100, 250, 500, 1000, 2500, 5000];
    this.histograms.set("notification_queue_wait_duration_ms", new Map());
    this.histograms.set("notification_dispatch_duration_ms", new Map());
  }

  _formatLabels(labels = {}) {
    const sortedKeys = Object.keys(labels).sort();
    if (sortedKeys.length === 0) return "";
    return sortedKeys.map((k) => `${k}="${labels[k]}"`).join(",");
  }

  _incCounter(metricName, labels = {}, value = 1) {
    const metric = this.counters.get(metricName);
    if (!metric) return;
    const labelKey = this._formatLabels(labels);
    const current = metric.get(labelKey) || 0;
    metric.set(labelKey, current + value);
  }

  _observeHistogram(metricName, labels = {}, value) {
    const metric = this.histograms.get(metricName);
    if (!metric) return;
    const labelKey = this._formatLabels(labels);
    let hist = metric.get(labelKey);
    if (!hist) {
      hist = {
        count: 0,
        sum: 0,
        buckets: this.histogramBuckets.map((le) => ({ le, count: 0 })),
        infCount: 0,
      };
      metric.set(labelKey, hist);
    }
    hist.count += 1;
    hist.sum += value;
    for (const b of hist.buckets) {
      if (value <= b.le) {
        b.count += 1;
      }
    }
    hist.infCount += 1;
  }

  // --- Tracing Hooks ---

  recordEnqueued({ tenantId = "default", channels = [], priority = "normal" } = {}) {
    const channelList = Array.isArray(channels) && channels.length > 0 ? channels : ["IN_APP"];
    for (const channel of channelList) {
      this._incCounter("notifications_enqueued_total", {
        tenant: tenantId,
        channel,
        priority,
      });
    }
  }

  recordQueueWaitTime({ tenantId = "default", durationMs = 0 } = {}) {
    this._observeHistogram("notification_queue_wait_duration_ms", { tenant: tenantId }, durationMs);
  }

  recordDispatch({ tenantId = "default", channel = "IN_APP", durationMs = 0, success = true, reason } = {}) {
    if (success) {
      this._incCounter("notifications_dispatched_total", {
        tenant: tenantId,
        channel,
        status: "success",
      });
    } else {
      this._incCounter("notifications_failed_total", {
        tenant: tenantId,
        channel,
        reason: reason || "unknown",
      });
    }
    this._observeHistogram("notification_dispatch_duration_ms", { tenant: tenantId, channel }, durationMs);
  }

  recordRateLimited({ tenantId = "default", channel = "PUSH" } = {}) {
    this._incCounter("notifications_rate_limited_total", {
      tenant: tenantId,
      channel,
    });
  }

  /**
   * Generates standard Prometheus exposition format text for /metrics endpoint.
   */
  getPrometheusMetrics() {
    let output = "";

    // Counters
    for (const [name, dataMap] of this.counters.entries()) {
      output += `# HELP ${name} Total count of ${name}\n`;
      output += `# TYPE ${name} counter\n`;
      for (const [labelKey, val] of dataMap.entries()) {
        const labelsStr = labelKey ? `{${labelKey}}` : "";
        output += `${name}${labelsStr} ${val}\n`;
      }
    }

    // Histograms
    for (const [name, dataMap] of this.histograms.entries()) {
      output += `# HELP ${name} Latency distribution for ${name}\n`;
      output += `# TYPE ${name} histogram\n`;
      for (const [labelKey, hist] of dataMap.entries()) {
        const prefix = labelKey ? `${labelKey},` : "";
        for (const b of hist.buckets) {
          output += `${name}_bucket{${prefix}le="${b.le}"} ${b.count}\n`;
        }
        output += `${name}_bucket{${prefix}le="+Inf"} ${hist.infCount}\n`;
        output += `${name}_sum{${labelKey ? "{" + labelKey + "}" : ""}} ${hist.sum}\n`;
        output += `${name}_count{${labelKey ? "{" + labelKey + "}" : ""}} ${hist.count}\n`;
      }
    }

    return output;
  }

  /**
   * Returns a clean JSON summary for internal APIs and health monitoring.
   */
  getMetricsSummary() {
    const summary = {
      enqueued: {},
      dispatched: {},
      failed: {},
      rateLimited: {},
      averages: {},
    };

    for (const [k, v] of this.counters.get("notifications_enqueued_total").entries()) {
      summary.enqueued[k || "total"] = v;
    }
    for (const [k, v] of this.counters.get("notifications_dispatched_total").entries()) {
      summary.dispatched[k || "total"] = v;
    }
    for (const [k, v] of this.counters.get("notifications_failed_total").entries()) {
      summary.failed[k || "total"] = v;
    }
    for (const [k, v] of this.counters.get("notifications_rate_limited_total").entries()) {
      summary.rateLimited[k || "total"] = v;
    }

    // Averages
    for (const [name, dataMap] of this.histograms.entries()) {
      summary.averages[name] = {};
      for (const [labelKey, hist] of dataMap.entries()) {
        summary.averages[name][labelKey || "total"] = hist.count > 0 ? Number((hist.sum / hist.count).toFixed(2)) : 0;
      }
    }

    return summary;
  }

  reset() {
    this.counters.clear();
    this.histograms.clear();
    this.initDefaultMetrics();
  }
}

const telemetry = new TelemetryService();

module.exports = {
  TelemetryService,
  telemetry,
};
