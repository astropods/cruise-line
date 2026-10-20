import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchConnectedRepos,
  fetchKnownUsers,
  fetchModelSettings,
  fetchRepoSettings,
  queryKeys,
  setUserRole,
  updateModelSetting,
  updateRepoScopePaths,
  type KnownUser,
  type ModelSetting,
  type ModelSettingsResponse,
  type ModelUse,
  type UserRole,
} from '../../api';

export function useConnectedRepos() {
  return useQuery({ queryKey: queryKeys.connectedRepos, queryFn: fetchConnectedRepos });
}

/** Scope settings for many repos at once, for the summaries in the repo list */
export function useRepoSettingsList(repos: readonly { owner: string; repo: string }[]) {
  return useQueries({
    queries: repos.map(({ owner, repo }) => ({
      queryKey: queryKeys.repoSettings(owner, repo),
      queryFn: () => fetchRepoSettings(owner, repo),
    })),
  });
}

export function useUpdateScope(owner: string, repo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scopePaths: string[]) => updateRepoScopePaths(owner, repo, scopePaths),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.repoSettings(owner, repo), data),
  });
}

export function useModelSettings() {
  return useQuery({ queryKey: queryKeys.modelSettings, queryFn: fetchModelSettings });
}

export function useUpdateModelSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ use, setting }: { use: ModelUse; setting: ModelSetting }) => updateModelSetting(use, setting),
    onSuccess: ({ settings }) =>
      queryClient.setQueryData<ModelSettingsResponse>(queryKeys.modelSettings, (data) => data && { ...data, settings }),
  });
}

export function useKnownUsers() {
  return useQuery({ queryKey: queryKeys.knownUsers, queryFn: fetchKnownUsers });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) => setUserRole(userId, role),
    onSuccess: ({ user }) =>
      queryClient.setQueryData<{ users: KnownUser[] }>(queryKeys.knownUsers, (data) =>
        data && { users: data.users.map((u) => (u.userId === user.userId ? user : u)) },
      ),
  });
}
