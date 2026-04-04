/**
 * Unit tests for jwtauth — top-level permission check.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const jsonwebtoken = require("jsonwebtoken");

const SECRET = "test-secret-key-for-unit-tests";

describe("jwtauth – checkUserPermission", function () {
  let originalEnv;
  let checkUserPermission;

  beforeEach(function () {
    originalEnv = process.env.AUTH_SECRET_KEY;
    process.env.AUTH_SECRET_KEY = SECRET;
    // Clear require cache so configuration picks up new env
    delete require.cache[require.resolve("../../server/configuration.js")];
    delete require.cache[require.resolve("../../server/auth/jwtauth.js")];
    delete require.cache[
      require.resolve("../../server/auth/jwtBoardnameAuth.js")
    ];
    checkUserPermission =
      require("../../server/auth/jwtauth.js").checkUserPermission;
  });

  afterEach(function () {
    if (originalEnv === undefined) {
      delete process.env.AUTH_SECRET_KEY;
    } else {
      process.env.AUTH_SECRET_KEY = originalEnv;
    }
    delete require.cache[require.resolve("../../server/configuration.js")];
    delete require.cache[require.resolve("../../server/auth/jwtauth.js")];
    delete require.cache[
      require.resolve("../../server/auth/jwtBoardnameAuth.js")
    ];
  });

  it("should return true for a moderator token", function () {
    var token = jsonwebtoken.sign({ roles: ["moderator"] }, SECRET);
    var url = new URL("http://localhost/boards/test?token=" + token);
    assert.equal(checkUserPermission(url), true);
  });

  it("should return false for an editor token", function () {
    var token = jsonwebtoken.sign({ roles: ["editor"] }, SECRET);
    var url = new URL("http://localhost/boards/test?token=" + token);
    assert.equal(checkUserPermission(url), false);
  });

  it("should return false for a token with no roles", function () {
    var token = jsonwebtoken.sign({ sub: "user1" }, SECRET);
    var url = new URL("http://localhost/boards/test?token=" + token);
    assert.equal(checkUserPermission(url), false);
  });

  it("should throw when no token is provided and AUTH_SECRET_KEY is set", function () {
    var url = new URL("http://localhost/boards/test");
    assert.throws(
      function () {
        checkUserPermission(url);
      },
      { message: "No token provided" },
    );
  });

  it("should return false when AUTH_SECRET_KEY is empty (auth disabled)", function () {
    process.env.AUTH_SECRET_KEY = "";
    delete require.cache[require.resolve("../../server/configuration.js")];
    delete require.cache[require.resolve("../../server/auth/jwtauth.js")];
    delete require.cache[
      require.resolve("../../server/auth/jwtBoardnameAuth.js")
    ];
    checkUserPermission =
      require("../../server/auth/jwtauth.js").checkUserPermission;

    var url = new URL("http://localhost/boards/test");
    assert.equal(checkUserPermission(url), false);
  });
});
