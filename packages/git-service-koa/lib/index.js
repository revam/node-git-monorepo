"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const git_service_1 = require("git-service");
__export(require("git-service"));
function createKoaMiddleware(controller, options = {}) {
    const keyName = options.keyName || "service";
    const autoDeploy = "autoDeploy" in options ? options.autoDeploy : true;
    return async (context, next) => {
        const service = context.state[keyName] = git_service_1.createService(controller, context.url, context.method.toUpperCase(), context.headers, context.req);
        // Link service state to context state.
        service.onRequest.addOnce((request) => request.state = context.state);
        await next();
        if (autoDeploy) {
            try {
                // Will only work if request is not already served.
                const response = await service.serve();
                if (response) {
                    response.headers.forEach((h, v) => context.set(h, v));
                    context.status = response.statusCode;
                    context.message = response.statusMessage;
                    context.body = response.body;
                }
            }
            catch (error) {
                context.throw(error);
            }
        }
    };
}
exports.createKoaMiddleware = createKoaMiddleware;
//# sourceMappingURL=index.js.map