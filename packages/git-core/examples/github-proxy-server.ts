/**
 * **Disclamer**: This is only meant to show how you _could_ proxy to a remote
 * server using only the core components and no additional framework (e.g.
 * express or koa), and should not be miss-used in any way.
 */

import { Server, IncomingMessage, ServerResponse } from "http";
import { Http2ServerRequest, Http2ServerResponse } from "http2";
import { BasicController } from "../src/main";
import middlewareFactory, { addLogging, restrictPathName } from "./middleware";

// Extend state.
declare module "../src/context" {
  export interface State {
    req: IncomingMessage | Http2ServerRequest;
    res: ServerResponse | Http2ServerResponse;
  }
}

// tslint:disable:no-console

// Configuration
const username = process.env.NODE_GITHUB_USERNAME || "revam";
const port = process.env.NODE_PORT || 3001;
const domain = process.env.NODE_DOMAIN || "localhost";

// Proxy user repositories from github as indicated by $username.
const controller = new BasicController({
  httpsOnly: true,
  origin: `https://github.com/${username}`,
});
const server = new Server(middlewareFactory(controller));

// Add simplistic logging of requests/responses.
addLogging(controller);

// Reject all requests without or with invalid Host header
const AllowedHostNames = new Set<string>([
  domain,
  `${domain}:${port}`,
]);
controller.use(function rejectOtherDomains({ request: { headers } }) {
  let host = headers.get("Host");
  if (!host || !(host = host.trim()) || !AllowedHostNames.has(host)) {
    return this.reject(400);
  }
});

// Restrict allowed pathnames to one segment which must end in ".git"
// (case-sensitive).
restrictPathName(controller);

// Append client ip to Forwarded header
controller.use(({ request: { headers }, state: { req: { socket: { remoteAddress: ip } } } }) => {
  if (!ip) {
    return;
  }
  let forwarded: string | null | string[] = headers.get("Forwarded");
  // Append ip to array.
  if (forwarded) {
    forwarded = forwarded.split(", ");
    forwarded.push(`for=${ip}`);
    forwarded = forwarded.join(", ");
  }
  // Set first ip
  else {
    forwarded = ip;
  }
  headers.set("X-Forwarded-For", forwarded);
});

// Addend proxy to Via header
const viaConstant = `HTTP/1.1 ${domain}${port !== 80 ? `:${port}` : ""}`;
controller.use(({ request: { headers } }) => {
  let via: string | null | string[] = headers.get("Via");
  if (via) {
    via = via.split(", ");
    via.push(viaConstant);
    via = via.join(", ");
  }
  else {
    via = viaConstant;
  }
  headers.set("Via", via);
});

server.listen(port, () => {
  console.log("[%s] Listening on all interfaces on port %s", new Date().toISOString(), port);
});
