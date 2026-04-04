/**
 * Unit tests for jwtBoardnameAuth — board-level role resolution.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const jsonwebtoken = require("jsonwebtoken");

const SECRET = "test-secret-key-for-unit-tests";

describe("jwtBoardnameAuth", function () {
  let originalEnv;
  let roleInBoard;
  let checkBoardnameInToken;

  beforeEach(function () {
    originalEnv = process.env.AUTH_SECRET_KEY;
    process.env.AUTH_SECRET_KEY = SECRET;
    delete require.cache[require.resolve("../../server/configuration.js")];
    delete require.cache[
      require.resolve("../../server/auth/jwtBoardnameAuth.js")
    ];
    const mod = require("../../server/auth/jwtBoardnameAuth.js");
    roleInBoard = mod.roleInBoard;
    checkBoardnameInToken = mod.checkBoardnameInToken;
  });

  afterEach(function () {
    if (originalEnv === undefined) {
      delete process.env.AUTH_SECRET_KEY;
    } else {
      process.env.AUTH_SECRET_KEY = originalEnv;
    }
    delete require.cache[require.resolve("../../server/configuration.js")];
    delete require.cache[
      require.resolve("../../server/auth/jwtBoardnameAuth.js")
    ];
  });

  describe("roleInBoard", function () {
    it("should return 'editor' when AUTH_SECRET_KEY is empty (auth disabled)", function () {
      process.env.AUTH_SECRET_KEY = "";
      delete require.cache[require.resolve("../../server/configuration.js")];
      delete require.cache[
        require.resolve("../../server/auth/jwtBoardnameAuth.js")
      ];
      roleInBoard = require("../../server/auth/jwtBoardnameAuth.js").roleInBoard;
      assert.equal(roleInBoard(null), "editor");
    });

    it("should throw when no token is provided and auth is enabled", function () {
      assert.throws(
        function () {
          roleInBoard(null);
        },
        { message: "No token provided" },
      );
    });

    it("should return 'editor' when token has no roles claim", function () {
      var token = jsonwebtoken.sign({ sub: "user1" }, SECRET);
      assert.equal(roleInBoard(token), "editor");
    });

    it("should return 'moderator' for a global moderator role", function () {
      var token = jsonwebtoken.sign({ roles: ["moderator"] }, SECRET);
      assert.equal(roleInBoard(token), "moderator");
    });

    it("should return 'editor' for a global editor role", function () {
      var token = jsonwebtoken.sign({ roles: ["editor"] }, SECRET);
      assert.equal(roleInBoard(token), "editor");
    });

    it("should return the specific role for a matching board name", function () {
      var token = jsonwebtoken.sign(
        { roles: ["editor:boardA", "moderator:boardB"] },
        SECRET,
      );
      assert.equal(roleInBoard(token, "boardB"), "moderator");
      assert.equal(roleInBoard(token, "boardA"), "editor");
    });

    it("should return 'forbidden' when board not in scoped roles", function () {
      var token = jsonwebtoken.sign(
        { roles: ["editor:boardA", "moderator:boardB"] },
        SECRET,
      );
      assert.equal(roleInBoard(token, "boardC"), "forbidden");
    });

    it("should throw on an invalid/tampered token", function () {
      assert.throws(function () {
        roleInBoard("invalid.token.here", "board1");
      });
    });

    it("should throw on a token signed with a different secret", function () {
      var token = jsonwebtoken.sign({ roles: ["editor"] }, "wrong-secret");
      assert.throws(function () {
        roleInBoard(token, "board1");
      });
    });
  });

  describe("checkBoardnameInToken", function () {
    it("should not throw when user has access to the board", function () {
      var token = jsonwebtoken.sign(
        { roles: ["editor:myBoard"] },
        SECRET,
      );
      var url = new URL("http://localhost/boards/myBoard?token=" + token);
      // Should not throw
      checkBoardnameInToken(url, "myBoard");
    });

    it("should throw when user is forbidden from the board", function () {
      var token = jsonwebtoken.sign(
        { roles: ["editor:otherBoard"] },
        SECRET,
      );
      var url = new URL("http://localhost/boards/secret?token=" + token);
      assert.throws(
        function () {
          checkBoardnameInToken(url, "secret");
        },
        { message: "Acess Forbidden" },
      );
    });
  });
});
