import fs from 'node:fs/promises';

const config = JSON.parse(await fs.readFile(new URL('../../infra/kubernetes/apps.json', import.meta.url), 'utf8'));
const documents = [];
const push = value => documents.push(JSON.stringify(value, null, 2));
const env = [
  { name: 'NODE_ENV', value: 'production' },
  { name: 'NODE_OPTIONS', value: '--require=@techzone/observability/register' },
  { name: 'SCHEMA_MANAGED_BY_MIGRATIONS', value: 'true' },
  { name: 'RABBIT_URL', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'rabbit-url' } } },
  { name: 'REDIS_URL', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'redis-url' } } },
  { name: 'AUTH_JWKS_URL', value: 'http://auth:3001/.well-known/jwks.json' },
  { name: 'AUTH_URL', value: 'http://auth:3001' },
  { name: 'CATALOG_URL', value: 'http://catalog:3002' },
  { name: 'INVENTORY_URL', value: 'http://inventory:3006' },
  { name: 'INTERNAL_API_KEY', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'internal-api-key' } } },
  { name: 'AUTH_PRIVATE_KEY_BASE64', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'auth-private-key-base64', optional: true } } },
  { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', value: 'http://otel-collector.observability:4318' },
];

push({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: config.namespace } });
push({
  apiVersion: 'batch/v1', kind: 'Job', metadata: { name: 'techzone-migration', namespace: config.namespace },
  spec: { backoffLimit: 3, ttlSecondsAfterFinished: 3600, template: { metadata: { labels: { app: 'techzone-migration' } }, spec: {
    restartPolicy: 'OnFailure',
    serviceAccountName: 'techzone',
    containers: [{ name: 'migration', image: config.image, command: ['node', 'tools/migrations/run.mjs'], env: [
      { name: 'POSTGRES_HOST', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'postgres-host' } } },
      { name: 'POSTGRES_USER', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'postgres-user' } } },
      { name: 'POSTGRES_PASSWORD', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: 'postgres-password' } } },
    ] }],
  } } },
});

for (const service of config.services) {
  const labels = { app: `techzone-${service.name}`, 'app.kubernetes.io/part-of': 'techzone' };
  push({
    apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: service.name, namespace: config.namespace, labels },
    spec: {
      replicas: service.replicas,
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      selector: { matchLabels: { app: labels.app } },
      template: {
        metadata: { labels, annotations: { 'prometheus.io/scrape': 'true', 'prometheus.io/path': '/metrics', 'prometheus.io/port': String(service.port) } },
        spec: {
          serviceAccountName: 'techzone',
          terminationGracePeriodSeconds: 30,
          containers: [{
            name: service.name,
            image: config.image,
            imagePullPolicy: 'IfNotPresent',
            command: ['node', service.name === 'gateway'
              ? 'apps/api-gateway/dist/main.js'
              : `apps/services/${service.name === 'admin' ? 'admin-query' : service.name}/dist/main.js`],
            ports: [{ name: 'http', containerPort: service.port }],
            env: [
              { name: 'PORT', value: String(service.port) },
              { name: 'SERVICE_NAME', value: service.name },
              { name: 'DATABASE_URL', valueFrom: { secretKeyRef: { name: 'techzone-secrets', key: `database-url-${service.name}` } } },
              ...env,
            ],
            resources: { requests: { cpu: '150m', memory: '256Mi' }, limits: { cpu: '1000m', memory: '768Mi' } },
            startupProbe: { httpGet: { path: '/health/live', port: 'http' }, failureThreshold: 30, periodSeconds: 5 },
            livenessProbe: { httpGet: { path: '/health/live', port: 'http' }, periodSeconds: 15, timeoutSeconds: 3, failureThreshold: 3 },
            readinessProbe: { httpGet: { path: '/health/ready', port: 'http' }, periodSeconds: 10, timeoutSeconds: 3, failureThreshold: 3 },
            lifecycle: { preStop: { exec: { command: ['sh', '-c', 'sleep 5'] } } },
          }],
        },
      },
    },
  });
  push({
    apiVersion: 'v1', kind: 'Service', metadata: { name: service.name, namespace: config.namespace, labels },
    spec: { selector: { app: labels.app }, ports: [{ name: 'http', port: service.port, targetPort: 'http' }] },
  });
  push({
    apiVersion: 'policy/v1', kind: 'PodDisruptionBudget', metadata: { name: `${service.name}-pdb`, namespace: config.namespace },
    spec: { minAvailable: 1, selector: { matchLabels: { app: labels.app } } },
  });
  if (service.hpa) push({
    apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler', metadata: { name: `${service.name}-hpa`, namespace: config.namespace },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: service.name },
      minReplicas: 2, maxReplicas: 6,
      metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } }],
      behavior: { scaleDown: { stabilizationWindowSeconds: 300 }, scaleUp: { stabilizationWindowSeconds: 30 } },
    },
  });
}

process.stdout.write(documents.join('\n---\n'));
