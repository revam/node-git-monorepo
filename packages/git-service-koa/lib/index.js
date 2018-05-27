"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const git_service_1 = require("git-service");
function createMiddleware(controller, options = {}) {
    const keyName = options.keyName || "service";
    const autoDeploy = options.autoDeploy || true;
    return async (context, next) => {
        const service = context.state[keyName] = git_service_1.createService(controller, context.url, context.method.toUpperCase(), context.headers, context.req);
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
exports.createMiddleware = createMiddleware;
//# sourceMappingURL=index.js.map