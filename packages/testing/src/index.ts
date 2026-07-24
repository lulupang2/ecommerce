export type ServiceFixture = {
  service: string;
  databaseUrl: string;
  correlationId: string;
};

export function createServiceFixture(service: string): ServiceFixture {
  return {
    service,
    databaseUrl: `postgres://canvas:canvas@localhost:5432/${service}`,
    correlationId: crypto.randomUUID(),
  };
}
