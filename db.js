"use strict";

const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (channel, chat_id, id);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  reply TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done'))
);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups (status, id);
`;

const PREVIEW_CHARS = 120;

/** All data access in one place: every query is parameterised. */
function createStore(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);

  const insertMessage = db.prepare(
    "INSERT INTO messages (ts, channel, chat_id, name, direction, text) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertFollowUp = db.prepare(
    "INSERT INTO followups (ts, channel, chat_id, name, message, reply, urgent) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  return {
    logMessage({ channel, chatId, name, direction, text }) {
      insertMessage.run(new Date().toISOString(), channel, String(chatId), name, direction, String(text));
    },

    addFollowUp({ channel, chatId, name, message, reply, urgent }) {
      const result = insertFollowUp.run(
        new Date().toISOString(),
        channel,
        String(chatId),
        name,
        message,
        reply,
        urgent ? 1 : 0
      );
      return Number(result.lastInsertRowid);
    },

    listFollowUps(status = "open", limit = 50) {
      return db
        .prepare("SELECT * FROM followups WHERE status = ? ORDER BY urgent DESC, id DESC LIMIT ?")
        .all(status, limit)
        .map((row) => ({ ...row, urgent: row.urgent === 1 }));
    },

    getFollowUp(id) {
      const row = db.prepare("SELECT * FROM followups WHERE id = ?").get(id);
      return row ? { ...row, urgent: row.urgent === 1 } : null;
    },

    setFollowUpStatus(id, status) {
      const result = db.prepare("UPDATE followups SET status = ? WHERE id = ?").run(status, id);
      return Number(result.changes) > 0;
    },

    listChats(limit = 50) {
      return db
        .prepare(
          `SELECT m.channel, m.chat_id, m.name, m.ts, m.direction,
                  substr(m.text, 1, ${PREVIEW_CHARS}) AS preview,
                  (SELECT COUNT(*) FROM messages c WHERE c.channel = m.channel AND c.chat_id = m.chat_id) AS messages
           FROM messages m
           WHERE m.id IN (SELECT MAX(id) FROM messages GROUP BY channel, chat_id)
           ORDER BY m.id DESC LIMIT ?`
        )
        .all(limit);
    },

    getChat(channel, chatId, limit = 200) {
      return db
        .prepare("SELECT * FROM (SELECT * FROM messages WHERE channel = ? AND chat_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id")
        .all(channel, String(chatId), limit);
    },

    stats() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const count = (sql, ...args) => Number(db.prepare(sql).get(...args).c);
      return {
        messagesToday: count("SELECT COUNT(*) c FROM messages WHERE direction = 'in' AND ts >= ?", since),
        chatsTotal: count("SELECT COUNT(*) c FROM (SELECT 1 FROM messages GROUP BY channel, chat_id)"),
        openFollowUps: count("SELECT COUNT(*) c FROM followups WHERE status = 'open'"),
        openUrgent: count("SELECT COUNT(*) c FROM followups WHERE status = 'open' AND urgent = 1"),
        resolvedFollowUps: count("SELECT COUNT(*) c FROM followups WHERE status = 'done'"),
      };
    },

    close() {
      db.close();
    },
  };
}

let shared;
/** The store used by the bots and the dashboard (one file, shared between processes). */
function getStore() {
  if (!shared) shared = createStore(require("./config").dbFile);
  return shared;
}

module.exports = { createStore, getStore };
