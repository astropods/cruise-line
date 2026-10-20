import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry outages, not client errors: a 403 or 404 won't change on retry
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      staleTime: 10_000,
    },
  },
});
