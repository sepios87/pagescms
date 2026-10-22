// Passenger startup file (PlanetHoster / N0C).
// The app lives in ~/cms-app (this file), the code and its build in ~/cms-src.
const path = require("path");
const { createServer } = require("http");

const dir = path.join(__dirname, "..", "cms-src");
// Pages CMS reads its .env from the working directory
process.chdir(dir);

const next = require(path.join(dir, "node_modules", "next"));
const app = next({ dev: false, dir });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3000);
});
