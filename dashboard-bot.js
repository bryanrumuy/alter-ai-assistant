"use strict";

const path = require("path");
const config = require("./config");
const { getStore } = require("./db");
const { readActive, writeActive } = require("./state");
const { createDashboard } = require("./dashboard");

if (!config.dashboardPassword) {
  console.error("DASHBOARD_PASSWORD is missing. Set a strong password in .env to start the dashboard.");
  process.exit(1);
}

const stateFile = path.join(config.dataDir, "telegram-state.json");
const server = createDashboard({
  store: getStore(),
  password: config.dashboardPassword,
  knowledgeFile: path.join(__dirname, config.knowledgeFile),
  readActive: () => readActive(stateFile),
  writeActive: (active) => writeActive(stateFile, active),
});

server.listen(config.dashboardPort, config.dashboardHost, () => {
  console.log(`Dashboard on http://${config.dashboardHost}:${config.dashboardPort} (user: any, password from DASHBOARD_PASSWORD)`);
});

process.once("SIGINT", () => server.close());
process.once("SIGTERM", () => server.close());
