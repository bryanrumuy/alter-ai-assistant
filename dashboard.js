"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const MAX_BODY_BYTES = 100 * 1024;
const MAX_KNOWLEDGE_CHARS = 8000;
const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "alter-dashboard";
const PAGE = path.join(__dirname, "dashboard.html");

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function sameSecret(given, expected) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function isAuthorized(req, password) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
  const separator = decoded.indexOf(":");
  return separator !== -1 && sameSecret(decoded.slice(separator + 1), password);
}

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, ...SECURITY_HEADERS, ...extra });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * The admin dashboard: a small HTTP server with a JSON API and one page.
 * `deps` is injected so tests can use a temporary database and files.
 */
function createDashboard({ store, password, knowledgeFile, readActive, writeActive }) {
  if (!password) throw new Error("DASHBOARD_PASSWORD is required");

  const routes = {
    "GET /api/overview": () => ({ stats: store.stats(), active: readActive() }),
    "GET /api/followups": (url) => ({
      items: store.listFollowUps(url.searchParams.get("status") === "done" ? "done" : "open", 100),
    }),
    "GET /api/chats": () => ({ chats: store.listChats(50) }),
    "GET /api/chat": (url) => ({
      messages: store.getChat(url.searchParams.get("channel") ?? "", url.searchParams.get("chatId") ?? "", 200),
    }),
    "GET /api/knowledge": () => ({ text: fs.existsSync(knowledgeFile) ? fs.readFileSync(knowledgeFile, "utf-8") : "" }),
    "POST /api/followups/done": async (_url, req) => {
      const { id } = await readJson(req);
      if (!Number.isInteger(id)) throw Object.assign(new Error("id must be an integer"), { status: 400 });
      return { ok: store.setFollowUpStatus(id, "done") };
    },
    "POST /api/active": async (_url, req) => {
      const { active } = await readJson(req);
      if (typeof active !== "boolean") throw Object.assign(new Error("active must be true or false"), { status: 400 });
      writeActive(active);
      return { active };
    },
    "PUT /api/knowledge": async (_url, req) => {
      const { text } = await readJson(req);
      if (typeof text !== "string") throw Object.assign(new Error("text must be a string"), { status: 400 });
      fs.writeFileSync(knowledgeFile, text.slice(0, MAX_KNOWLEDGE_CHARS));
      return { ok: true };
    },
  };

  return http.createServer(async (req, res) => {
    try {
      if (!isAuthorized(req, password)) {
        send(res, 401, { error: "Login required" }, "application/json; charset=utf-8", {
          "WWW-Authenticate": 'Basic realm="Alter dashboard", charset="UTF-8"',
        });
        return;
      }
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        send(res, 200, fs.readFileSync(PAGE, "utf-8"), "text/html; charset=utf-8");
        return;
      }
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) {
        send(res, 404, { error: "Not found" });
        return;
      }
      // Browsers cache Basic credentials, so state-changing calls must carry a header
      // that another website cannot add to a cross-origin request.
      if (req.method !== "GET" && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
        send(res, 403, { error: "Missing request header" });
        return;
      }
      send(res, 200, await handler(url, req));
    } catch (error) {
      const status = error.status ?? (error.message === "Invalid JSON" ? 400 : 500);
      if (status === 500) console.log("Dashboard error:", error.message);
      send(res, status, { error: status === 500 ? "Server error" : error.message });
    }
  });
}

module.exports = { createDashboard, CSRF_HEADER, CSRF_VALUE };
