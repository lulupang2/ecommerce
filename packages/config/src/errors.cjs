const { Catch, HttpException } = require('@nestjs/common');
const { currentContext } = require('@techzone/observability/context');
const logger = require('@techzone/observability/logger');

class StandardExceptionFilter {
  catch(exception, host) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : Number(exception.status || 500);
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const rawBody = raw && typeof raw === 'object' ? raw : {};
    const context = currentContext();
    const body = {
      code: rawBody.code || exception.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
      message: rawBody.message || exception.message || '요청을 처리하지 못했습니다.',
      requestId: request.requestId || context.requestId,
      ...(rawBody.details ? { details: rawBody.details } : {}),
      timestamp: new Date().toISOString(),
    };
    if (status >= 500) logger.error('request.failed', { status, code: body.code, error: exception.message, stack: exception.stack });
    response.status(status).json(body);
  }
}
Catch()(StandardExceptionFilter);

function standardErrorMiddleware(error, req, res, _next) {
  const status = Number(error.status || 500);
  if (status >= 500) logger.error('request.failed', { status, error: error.message, stack: error.stack });
  res.status(status).json({
    code: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
    message: error.expose === false ? '요청을 처리하지 못했습니다.' : error.message,
    requestId: req.requestId,
    ...(error.details ? { details: error.details } : {}),
    timestamp: new Date().toISOString(),
  });
}

module.exports = { StandardExceptionFilter, standardErrorMiddleware };
