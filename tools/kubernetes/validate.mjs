import fs from 'node:fs/promises';

const manifestPath = process.argv[2];
if (!manifestPath) {
  throw new Error('Usage: node tools/kubernetes/validate.mjs <manifest-file>');
}

const source = await fs.readFile(manifestPath, 'utf8');
const documents = source
  .split(/\r?\n---\r?\n/)
  .map(document => document.trim())
  .filter(Boolean)
  .map((document, index) => {
    try {
      return JSON.parse(document);
    } catch (error) {
      throw new Error(`Kubernetes document ${index + 1} is not valid JSON: ${error.message}`);
    }
  });

if (documents.length !== 46) {
  throw new Error(`Expected 46 Kubernetes resources, received ${documents.length}`);
}

const identities = new Set();
for (const [index, document] of documents.entries()) {
  const identity = [
    document.apiVersion,
    document.kind,
    document.metadata?.namespace || 'default',
    document.metadata?.name,
  ];
  if (identity.some(value => typeof value !== 'string' || value.length === 0)) {
    throw new Error(`Kubernetes document ${index + 1} is missing apiVersion, kind, or metadata.name`);
  }
  const key = identity.join('/');
  if (identities.has(key)) {
    throw new Error(`Duplicate Kubernetes resource: ${key}`);
  }
  identities.add(key);
}

const requiredServiceUrls = [
  'AUTH_URL',
  'CATALOG_URL',
  'CART_URL',
  'ORDER_URL',
  'PAYMENT_URL',
  'INVENTORY_URL',
  'NOTIFICATION_URL',
  'SEARCH_URL',
  'MEDIA_URL',
  'FULFILLMENT_URL',
  'PROCUREMENT_URL',
  'ADMIN_URL',
];
for (const deployment of documents.filter(document => document.kind === 'Deployment')) {
  const variables = new Set(
    (deployment.spec?.template?.spec?.containers?.[0]?.env || [])
      .map(variable => variable.name),
  );
  const missing = requiredServiceUrls.filter(name => !variables.has(name));
  if (missing.length) {
    throw new Error(
      `Deployment ${deployment.metadata.name} is missing service discovery variables: ${missing.join(', ')}`,
    );
  }
}

console.log(`Validated ${documents.length} Kubernetes resources.`);
