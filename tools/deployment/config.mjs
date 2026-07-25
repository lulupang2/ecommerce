import crypto from 'node:crypto';

const placeholderValues = new Set([
  '',
  'CHANGE_ME',
  'canvas',
  'guest',
  'minioadmin',
  'techzone-internal',
  'TechzoneAdmin123!',
]);

export function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function serializeEnv(values) {
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

export function isDeployableDomain(domain) {
  if (!domain || domain === 'localhost' || domain.endsWith('.local') || domain.includes('your-domain')) return false;
  if (domain === 'example.com' || domain.endsWith('.example.com')) return false;
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain);
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function generateDeploymentEnv({ domain, email }) {
  if (!isDeployableDomain(domain)) throw new Error('실제 공개 도메인을 --domain으로 입력해야 합니다.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw new Error('유효한 ACME 이메일을 --email로 입력해야 합니다.');

  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyBase64 = Buffer
    .from(privateKey.export({ type: 'pkcs8', format: 'pem' }))
    .toString('base64');

  return {
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'demo',
    DEMO_DOMAIN: domain,
    ACME_EMAIL: email,
    PUBLIC_BIND_ADDRESS: '127.0.0.1',
    MANAGEMENT_BIND_ADDRESS: '127.0.0.1',
    ADMIN_EMAIL: `admin@${domain}`,
    ADMIN_PASSWORD: randomSecret(24),
    AUTH_PRIVATE_KEY_BASE64: privateKeyBase64,
    AUTH_KEY_ID: `techzone-demo-${crypto.randomBytes(6).toString('hex')}`,
    JWT_ISSUER: 'techzone-auth',
    INTERNAL_API_KEY: randomSecret(),
    POSTGRES_PASSWORD: randomSecret(),
    RABBITMQ_USER: 'techzone',
    RABBITMQ_PASSWORD: randomSecret(),
    MINIO_ROOT_USER: 'techzone-media',
    MINIO_ROOT_PASSWORD: randomSecret(),
    GRAFANA_ADMIN_USER: 'techzone-admin',
    GRAFANA_ADMIN_PASSWORD: randomSecret(),
    CORS_ORIGIN: `https://${domain}`,
    S3_PUBLIC_ENDPOINT: `https://media.${domain}`,
    GRAFANA_URL: `https://grafana.${domain}`,
    TOSS_SECRET_KEY: '',
  };
}

function validateSecret(values, key, errors, minimumLength = 24) {
  const value = values[key];
  if (!value || placeholderValues.has(value) || value.length < minimumLength) {
    errors.push(`${key}: ${minimumLength}자 이상의 고유한 비밀값이 필요합니다.`);
  }
}

export function validateDeploymentEnv(values) {
  const errors = [];
  const domain = values.DEMO_DOMAIN;

  if (values.NODE_ENV !== 'production') errors.push('NODE_ENV: production이어야 합니다.');
  if (!['demo', 'production'].includes(values.DEPLOYMENT_ENVIRONMENT)) {
    errors.push('DEPLOYMENT_ENVIRONMENT: demo 또는 production이어야 합니다.');
  }
  if (!isDeployableDomain(domain)) errors.push('DEMO_DOMAIN: 실제 공개 도메인이 필요합니다.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.ACME_EMAIL || '')) {
    errors.push('ACME_EMAIL: 인증서 만료 알림을 받을 이메일이 필요합니다.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.ADMIN_EMAIL || '')) {
    errors.push('ADMIN_EMAIL: 유효한 관리자 이메일이 필요합니다.');
  }
  if (values.PUBLIC_BIND_ADDRESS !== '127.0.0.1') {
    errors.push('PUBLIC_BIND_ADDRESS: HTTPS 프록시 뒤의 127.0.0.1이어야 합니다.');
  }
  if (values.MANAGEMENT_BIND_ADDRESS !== '127.0.0.1') {
    errors.push('MANAGEMENT_BIND_ADDRESS: 관리 포트 보호를 위해 127.0.0.1이어야 합니다.');
  }

  validateSecret(values, 'ADMIN_PASSWORD', errors, 20);
  validateSecret(values, 'INTERNAL_API_KEY', errors);
  validateSecret(values, 'POSTGRES_PASSWORD', errors);
  validateSecret(values, 'RABBITMQ_PASSWORD', errors);
  validateSecret(values, 'MINIO_ROOT_PASSWORD', errors);
  validateSecret(values, 'GRAFANA_ADMIN_PASSWORD', errors);

  for (const key of ['POSTGRES_PASSWORD', 'RABBITMQ_PASSWORD']) {
    if (values[key] && !/^[A-Za-z0-9_-]+$/.test(values[key])) {
      errors.push(`${key}: 연결 URL에 안전한 영문·숫자·_- 문자만 사용해야 합니다.`);
    }
  }

  if (!values.RABBITMQ_USER || placeholderValues.has(values.RABBITMQ_USER)) {
    errors.push('RABBITMQ_USER: 기본 계정을 사용할 수 없습니다.');
  }
  if (!values.MINIO_ROOT_USER || placeholderValues.has(values.MINIO_ROOT_USER)) {
    errors.push('MINIO_ROOT_USER: 기본 계정을 사용할 수 없습니다.');
  }
  if (!values.GRAFANA_ADMIN_USER || placeholderValues.has(values.GRAFANA_ADMIN_USER)) {
    errors.push('GRAFANA_ADMIN_USER: 기본 계정을 사용할 수 없습니다.');
  }
  if (!values.AUTH_KEY_ID || placeholderValues.has(values.AUTH_KEY_ID)) errors.push('AUTH_KEY_ID: 고유한 키 ID가 필요합니다.');

  try {
    const privateKey = crypto.createPrivateKey(Buffer.from(values.AUTH_PRIVATE_KEY_BASE64 || '', 'base64'));
    if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails?.modulusLength < 2048) {
      errors.push('AUTH_PRIVATE_KEY_BASE64: 2048비트 이상의 RSA 개인키가 필요합니다.');
    }
  } catch {
    errors.push('AUTH_PRIVATE_KEY_BASE64: 유효한 PKCS#8 RSA 개인키가 아닙니다.');
  }

  if (domain && values.CORS_ORIGIN !== `https://${domain}`) {
    errors.push(`CORS_ORIGIN: https://${domain}과 일치해야 합니다.`);
  }
  if (domain && values.S3_PUBLIC_ENDPOINT !== `https://media.${domain}`) {
    errors.push(`S3_PUBLIC_ENDPOINT: https://media.${domain}과 일치해야 합니다.`);
  }
  if (domain && values.GRAFANA_URL !== `https://grafana.${domain}`) {
    errors.push(`GRAFANA_URL: https://grafana.${domain}과 일치해야 합니다.`);
  }

  return errors;
}
