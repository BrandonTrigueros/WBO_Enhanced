/**
 * Unit tests for templating.js — Handlebars template rendering & language negotiation.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

const {
  Template,
  BoardTemplate,
  BookTemplate,
} = require("../../server/http/templating.js");

/** Create a minimal Handlebars template file for testing */
function createTempTemplate(content) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-tpl-"));
  const tplPath = path.join(tmpDir, "test.hbs");
  fs.writeFileSync(tplPath, content);
  return { tplPath, tmpDir };
}

/** Minimal fake request object */
function fakeRequest(urlPath, acceptLanguage) {
  return {
    url: urlPath,
    headers: {
      host: "localhost:8080",
      "accept-language": acceptLanguage || "en-US,en;q=0.9",
    },
    connection: { encrypted: false },
  };
}

describe("Template", function () {
  let tmpDir, tplPath, template;

  it("should compile a Handlebars template", function () {
    const { tplPath: p, tmpDir: d } = createTempTemplate(
      "<h1>{{language}}</h1>",
    );
    tplPath = p;
    tmpDir = d;
    template = new Template(tplPath);
    assert.ok(template.template);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("parameters", function () {
    it("should resolve language from Accept-Language header", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("{{language}}");
      template = new Template(p);
      const req = fakeRequest("/boards/test", "en-US,en;q=0.9");
      const parsedUrl = require("url").parse(req.url, true);
      const params = template.parameters(parsedUrl, req, false);

      assert.equal(params.language, "en");
      assert.ok(params.translations);
      assert.ok(params.baseUrl);
      assert.equal(params.moderator, false);
      fs.rmSync(d, { recursive: true, force: true });
    });

    it("should override language via ?lang query parameter", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("{{language}}");
      template = new Template(p);
      const req = fakeRequest("/boards/test?lang=fr", "en-US");
      const parsedUrl = require("url").parse(req.url, true);
      const params = template.parameters(parsedUrl, req, false);

      assert.equal(params.language, "fr");
      fs.rmSync(d, { recursive: true, force: true });
    });

    it("should default to 'en' for unknown languages", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("{{language}}");
      template = new Template(p);
      const req = fakeRequest("/boards/test", "xx-UNKNOWN");
      const parsedUrl = require("url").parse(req.url, true);
      const params = template.parameters(parsedUrl, req, false);

      assert.equal(params.language, "en");
      fs.rmSync(d, { recursive: true, force: true });
    });

    it("should set moderator flag when passed true", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("{{moderator}}");
      template = new Template(p);
      const req = fakeRequest("/boards/test", "en");
      const parsedUrl = require("url").parse(req.url, true);
      const params = template.parameters(parsedUrl, req, true);

      assert.equal(params.moderator, true);
      fs.rmSync(d, { recursive: true, force: true });
    });

    it("should compute baseUrl from host header", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("{{baseUrl}}");
      template = new Template(p);
      const req = fakeRequest("/boards/test", "en");
      const parsedUrl = require("url").parse(req.url, true);
      const params = template.parameters(parsedUrl, req, false);

      assert.equal(params.baseUrl, "http://localhost:8080");
      fs.rmSync(d, { recursive: true, force: true });
    });
  });

  describe("serve", function () {
    it("should render template and write HTTP response", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate(
        "<html>{{language}}</html>",
      );
      template = new Template(p);

      let statusCode, headers, body;
      const fakeRes = {
        writeHead(code, h) {
          statusCode = code;
          headers = h;
        },
        end(b) {
          body = b;
        },
      };

      template.serve(fakeRequest("/boards/test", "en"), fakeRes, false);

      assert.equal(statusCode, 200);
      assert.equal(headers["Content-Type"], "text/html");
      assert.ok(body.includes("en"));
      fs.rmSync(d, { recursive: true, force: true });
    });

    it("should set Vary header when no ?lang query", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("test");
      template = new Template(p);

      let headers;
      const fakeRes = {
        writeHead(_, h) {
          headers = h;
        },
        end() {},
      };

      template.serve(fakeRequest("/boards/test", "en"), fakeRes, false);

      assert.equal(headers["Vary"], "Accept-Language");
      fs.rmSync(d, { recursive: true, force: true });
    });

    it("should NOT set Vary header when ?lang is specified", function () {
      const { tplPath: p, tmpDir: d } = createTempTemplate("test");
      template = new Template(p);

      let headers;
      const fakeRes = {
        writeHead(_, h) {
          headers = h;
        },
        end() {},
      };

      template.serve(fakeRequest("/boards/test?lang=de", "en"), fakeRes, false);

      assert.equal(headers["Vary"], undefined);
      fs.rmSync(d, { recursive: true, force: true });
    });
  });
});

describe("BoardTemplate", function () {
  it("should extract board name from URL", function () {
    const { tplPath: p, tmpDir: d } = createTempTemplate(
      "{{board}} {{boardUriComponent}}",
    );
    const template = new BoardTemplate(p);
    const req = fakeRequest("/boards/my%20board", "en");
    const parsedUrl = require("url").parse(req.url, true);
    const params = template.parameters(parsedUrl, req, false);

    assert.equal(params.boardUriComponent, "my%20board");
    assert.equal(params.board, "my board");
    fs.rmSync(d, { recursive: true, force: true });
  });

  it("should parse hideMenu query parameter", function () {
    const { tplPath: p, tmpDir: d } = createTempTemplate("{{hideMenu}}");
    const template = new BoardTemplate(p);

    const req1 = fakeRequest("/boards/test?hideMenu=true", "en");
    const parsed1 = require("url").parse(req1.url, true);
    assert.equal(template.parameters(parsed1, req1, false).hideMenu, true);

    const req2 = fakeRequest("/boards/test", "en");
    const parsed2 = require("url").parse(req2.url, true);
    assert.equal(template.parameters(parsed2, req2, false).hideMenu, false);

    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe("BookTemplate", function () {
  it("should extract book name and current page from URL", function () {
    const { tplPath: p, tmpDir: d } = createTempTemplate(
      "{{bookName}} p{{currentPage}}",
    );
    const template = new BookTemplate(p);
    const req = fakeRequest("/books/my%20notebook?page=3", "en");
    const parsedUrl = require("url").parse(req.url, true);
    const params = template.parameters(parsedUrl, req, false);

    assert.equal(params.bookUriComponent, "my%20notebook");
    assert.equal(params.bookName, "my notebook");
    assert.equal(params.currentPage, 3);
    fs.rmSync(d, { recursive: true, force: true });
  });

  it("should default to page 1 when no page query", function () {
    const { tplPath: p, tmpDir: d } = createTempTemplate("p{{currentPage}}");
    const template = new BookTemplate(p);
    const req = fakeRequest("/books/notebook", "en");
    const parsedUrl = require("url").parse(req.url, true);
    const params = template.parameters(parsedUrl, req, false);

    assert.equal(params.currentPage, 1);
    fs.rmSync(d, { recursive: true, force: true });
  });
});
