// Loaded with NODE_OPTIONS before service modules so HTTP, pg and amqplib are instrumented.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  require('./otel.cjs').startTelemetry(process.env.SERVICE_NAME || 'techzone-service').catch(error => {
    console.error(JSON.stringify({ level: 'error', message: 'otel.bootstrap_failed', error: error.message }));
  });
}
