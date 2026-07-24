const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

function validationDetails(errors) {
  return errors.flatMap(error => [
    ...Object.values(error.constraints || {}).map(message => ({ field: error.property, message })),
    ...validationDetails(error.children || []).map(item => ({ ...item, field: `${error.property}.${item.field}` })),
  ]);
}

function validateDto(DtoClass, source = 'body') {
  return async (req, res, next) => {
    const value = plainToInstance(DtoClass, req[source] || {}, { enableImplicitConversion: true });
    const errors = await validate(value, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    });
    if (errors.length) {
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: '요청 값을 확인해 주세요.',
        requestId: req.requestId,
        details: validationDetails(errors),
        timestamp: new Date().toISOString(),
      });
    }
    req[source] = value;
    next();
  };
}

module.exports = { validateDto, validationDetails };
