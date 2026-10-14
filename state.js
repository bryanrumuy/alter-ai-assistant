"use strict";

const fs = require("fs");

/** The on/off switch lives in a small file so the dashboard and the bot share it. */
function readActive(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")).active === true;
  } catch {
    return false;
  }
}

function writeActive(file, active) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ active }));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.log(`Could not save ${file}:`, error.message);
  }
}

module.exports = { readActive, writeActive };
