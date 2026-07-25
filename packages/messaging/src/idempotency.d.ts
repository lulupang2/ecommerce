export interface IdempotentResult<T = unknown> {
  status: number;
  body: T;
  replayed?: boolean;
}

export function executeIdempotent<T>(
  database: unknown,
  name: string,
  request: unknown,
  operation: () => Promise<IdempotentResult<T>>,
): Promise<IdempotentResult<T>>;
