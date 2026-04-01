/**
 * Unit tests for RateLimiter — per-socket emit throttling.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { RateLimiter } = require("../../server/socket/RateLimiter.js");

/** Minimal fake socket for RateLimiter.allow() */
function fakeSocket() {
  return {
    client: {
      request: {
        headers: { "user-agent": "test", "x-forwarded-for": "127.0.0.1" },
      },
    },
  };
}

describe("RateLimiter", function () {
  it("should allow messages under the limit", function () {
    var limiter = new RateLimiter(5, 60000); // 5 per 60s
    var socket = fakeSocket();

    for (var i = 0; i < 5; i++) {
      assert.equal(limiter.allow(socket), true);
    }
  });

  it("should block messages over the limit", function () {
    var limiter = new RateLimiter(3, 60000);
    var socket = fakeSocket();

    assert.equal(limiter.allow(socket), true);
    assert.equal(limiter.allow(socket), true);
    assert.equal(limiter.allow(socket), true);
    assert.equal(limiter.allow(socket), false); // 4th should be blocked
  });

  it("should reset count in new period", function () {
    // Use a very short period so we can test reset
    var limiter = new RateLimiter(2, 1); // 2 per 1ms period
    var socket = fakeSocket();

    limiter.allow(socket);
    limiter.allow(socket);
    assert.equal(limiter.allow(socket), false); // blocked

    // Manually simulate period change
    limiter.lastPeriod = limiter.lastPeriod - 2;
    assert.equal(limiter.allow(socket), true); // reset, should pass
  });

  it("should use defaults from config when no args provided", function () {
    var limiter = new RateLimiter();
    assert.ok(limiter.maxCount > 0);
    assert.ok(limiter.periodMs > 0);
  });
});
