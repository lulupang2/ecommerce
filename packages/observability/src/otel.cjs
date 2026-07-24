let sdk;

async function startTelemetry(service) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || sdk) return;
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '');
  sdk = new NodeSDK({
    serviceName: service,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }) }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
  await sdk.start();
}

async function stopTelemetry() {
  if (sdk) await sdk.shutdown();
}

module.exports = { startTelemetry, stopTelemetry };
