const { AsyncLocalStorage } = require('node:async_hooks');

const requestContext = new AsyncLocalStorage();

function contextMiddleware(service) {
  return (req, res, next) => {
    const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
    const correlationId = String(req.headers['x-correlation-id'] || requestId);
    const causationId = req.headers['x-causation-id'] ? String(req.headers['x-causation-id']) : null;
    req.requestId = requestId;
    req.correlationId = correlationId;
    req.causationId = causationId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);
    requestContext.run({ service, requestId, correlationId, causationId, startedAt: Date.now() }, next);
  };
}

function currentContext() {
  return requestContext.getStore() || {};
}

function setContextFields(fields) {
  const store = requestContext.getStore();
  if (store) Object.assign(store, fields);
}

module.exports = { contextMiddleware, currentContext, setContextFields };
