export interface EventEnvelope<TPayload = unknown> {
  id: string;
  type: string;
  source: string;
  requestId: string | null;
  correlationId: string;
  causationId: string | null;
  actorId: string | null;
  occurredAt: string;
  schemaVersion: 1;
  payload: TPayload;
}

export interface EventMetadata {
  id?: string;
  source?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  actorId?: string;
  occurredAt?: string;
}
