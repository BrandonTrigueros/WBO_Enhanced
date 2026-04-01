/**
 * RateLimiter — per-socket emit throttling to prevent flooding.
 *
 * Extracted from sockets.js for Single Responsibility.
 * Each socket gets its own RateLimiter instance.
 *
 * @module RateLimiter
 */

var { log } = require("../util/log.js"),
  config = require("../configuration.js");

class RateLimiter {
  /**
   * @param {number} [maxCount]  - Max messages per period (default: config.MAX_EMIT_COUNT)
   * @param {number} [periodMs] - Period in ms (default: config.MAX_EMIT_COUNT_PERIOD)
   */
  constructor(maxCount, periodMs) {
    this.maxCount = maxCount || config.MAX_EMIT_COUNT;
    this.periodMs = periodMs || config.MAX_EMIT_COUNT_PERIOD;
    this.lastPeriod = (Date.now() / this.periodMs) | 0;
    this.emitCount = 0;
  }

  /**
   * Check whether a message should be allowed through.
   * @param {object} socket - The socket.io socket (used for logging only)
   * @returns {boolean} true if the message is allowed, false if rate-limited
   */
  allow(socket) {
    var currentPeriod = (Date.now() / this.periodMs) | 0;
    if (currentPeriod === this.lastPeriod) {
      this.emitCount++;
      if (this.emitCount > this.maxCount) {
        if (this.emitCount % 100 === 0) {
          var request = socket.client.request;
          log("BANNED", {
            user_agent: request.headers["user-agent"],
            original_ip:
              request.headers["x-forwarded-for"] ||
              request.headers["forwarded"],
            emit_count: this.emitCount,
          });
        }
        return false;
      }
    } else {
      this.emitCount = 0;
      this.lastPeriod = currentPeriod;
    }
    return true;
  }
}

module.exports = { RateLimiter: RateLimiter };
