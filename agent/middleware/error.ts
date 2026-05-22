import type { ErrorHandler } from 'hono';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode as any);
  }

  // Surface GitHub API auth failures as 401 so the frontend can trigger re-login
  if ((err as any)?.status === 401) {
    return c.json({ error: 'Your GitHub session has expired. Please sign in again.' }, 401);
  }

  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
};
