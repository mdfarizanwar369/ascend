const fs = require("node:fs");
const path = require("node:path");
fs.cpSync(path.join(__dirname, "../certificates"), path.join(__dirname, "../dist/certificates"), { recursive: true });
