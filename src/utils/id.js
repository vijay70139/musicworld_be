const crypto = require("crypto");

function shortId() {
  return crypto.randomBytes(4).toString("hex"); // 8 chars
}

module.exports = { shortId };
