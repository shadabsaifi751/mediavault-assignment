import { QueryClient } from '@tanstack/react-query';
import { isRetryableError } from '@/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        return isRetryableError(error);
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        return isRetryableError(error);
      },
    },
  },
});
