import { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import { Http2ServerRequest, Http2ServerResponse } from "http2";
import { Context, LogicController, ServiceController } from "../src/main";

// tslint:disable:no-console

interface ExtendedError extends Error {
  expose?: boolean;
  inner?: any;
  status?: number;
  statusCode?: number;
}

export default function middlewareFactory(
  controller: ServiceController,
): (req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, nxt?: (err?: any) => any) => Promise<void> {
  return async function serverHandle(request, response, next): Promise<void> {
    let context: Context | undefined;
    let error: ExtendedError | undefined;
    try {
      context = new Context(
        request.socket.remoteAddress,
        request.url,
        request.method,
        request,
        request.headers as any,
      );
      await controller.serve(context);
    } catch (err) {
      if (err instanceof Error) {
        error = err;
      }
      else {
        error = new Error("Non-standard error thrown...");
        error.inner = err;
      }
    } finally {
      // Transmit error.
      if (context) {
        response.statusCode = context.status;
        for (const [header, value] of context.headers) {
          response.setHeader(header, value);
        }
        if (response instanceof Http2ServerResponse) {
          context.readable.response().pipe(response.stream);
        }
        else {
          context.readable.response().pipe(response);
        }
      }
      // We still need to handle responses when constructor throws.
      else if (error) {
        const status = response.statusCode = error.status || error.statusCode || 500;
        const message = error.expose ? error.message : STATUS_CODES[status];
        if (response instanceof Http2ServerResponse) {
          response.stream.end(message);
        }
        else {
          response.end(message);
        }
      }
      // I don't know how.
      else {
        response.statusCode = 500;
        const message = STATUS_CODES[500]!;
        if (response instanceof Http2ServerResponse) {
          response.stream.end(message);
        }
        else {
          response.end(message);
        }
      }
      if (next) {
        next(error);
      }
      // Report error if no handler is set.
      else if (error) {
        console.error(error);
      }
    }
  };
}

export function addLogging(controller: LogicController): void {
  // Add some simplistic logging in console.
  let i = 0;
  controller.onUsable.add((context) => {
    const date = context.state.date = new Date();
    context.state.i = (i += 1).toString(16).padStart(4, "0");
    console.log("[%s] (%s) %s %s", date.toISOString(), context.state.i, context.method, context.url);
  });
  controller.onComplete.add((context) => {
    const date = new Date();
    const ms = date.valueOf() - (context.state.date as Date).valueOf();
    console.log("[%s] (%s) %s %sms", date.toISOString(), context.state.i, context.status, ms);
  });
}

export function restrictPathName(controller: LogicController): void {
  // Restrict allowed pathnames to one segment which must end in ".git"
  // (case-sensitive).
  const AllowRegex = /^[^\/]+.git$/;
  controller.use(function rejectDisallowedNames(context): void {
    if (!AllowRegex.test(context.pathname)) {
      this.reject(404);
    }
  });
}
