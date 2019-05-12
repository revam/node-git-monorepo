import { Server } from "http";
import { resolve } from "path";
import { BasicController } from "../src/main";
import middlewareFactory, { addLogging, restrictPathName } from "./middleware";

// tslint:disable:no-console

// Configuration
// It is not necesary to resolve the path beforehand, but is done here for logging purposes.
const origin = resolve(process.env.NODE_ORIGIN || "./data");
const port = process.env.NODE_PORT || 3001;

console.log("[%s] Origin is %s", new Date().toISOString(), origin);

// Proxy user repositories from github as indicated by $username.
const controller = new BasicController({
  origin,
  overrides: {
    checkForAuth: true,
  },
});
const server = new Server(middlewareFactory(controller));

// Add simplistic logging of requests/responses.
addLogging(controller);

// Restrict allowed pathnames to one segment which must end in ".git"
// (case-sensitive).
restrictPathName(controller);

server.listen(port, () => {
  console.log("[%s] Listening on all interfaces on port %s", new Date().toISOString(), port);
});
