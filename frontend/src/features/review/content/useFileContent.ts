import { useQuery } from '@tanstack/react-query';
import { fetchFileContent, queryKeys } from '../../../api';
import { useSlideout } from './SlideoutContext';

/**
 * A file from the PR's checkout, for files the review didn't include.
 * Cached per head commit, so embeds of the same file share one request.
 */
export function useFileContent(path: string | null) {
  const { pr } = useSlideout();
  return useQuery({
    queryKey: queryKeys.prFile(pr?.owner ?? '', pr?.repo ?? '', pr?.number ?? 0, pr?.headSha ?? '', path ?? ''),
    queryFn: () => fetchFileContent(pr!.owner, pr!.repo, pr!.number, path!),
    enabled: !!pr && !!path,
    staleTime: Infinity,
    retry: false,
  });
}
