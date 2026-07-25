export function catalogEndpoint(pathname) {
  const base =
    process.env.CATALOG_URL ||
    process.env.INTERNAL_API_BASE_URL ||
    'http://gateway:8080/api';
  return `${base.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`;
}
