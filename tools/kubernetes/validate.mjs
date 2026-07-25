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

console.log(`Validated ${documents.length} Kubernetes resources.`);
