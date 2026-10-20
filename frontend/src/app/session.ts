import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser, fetchSetupStatus, queryKeys } from '../api';

/** The signed-in user; `data` is null when signed out */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
  });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: fetchSetupStatus,
    staleTime: 5 * 60_000,
  });
}
