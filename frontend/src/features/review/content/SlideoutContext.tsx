import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SlideoutState {
  file: string;
  lines?: [number, number];
}

interface SlideoutContextValue {
  activeSlideout: SlideoutState | null;
  openFile: (file: string, lines?: [number, number]) => void;
  closeFile: () => void;
  /** GitHub HTML URL for linking to files in the PR */
  githubFileUrl: (file: string) => string;
}

const SlideoutContext = createContext<SlideoutContextValue>({
  activeSlideout: null,
  openFile: () => {},
  closeFile: () => {},
  githubFileUrl: () => '',
});

interface SlideoutProviderProps {
  children: ReactNode;
  githubUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
}

export function SlideoutProvider({ children, githubUrl, owner, repo, prNumber, headSha }: SlideoutProviderProps) {
  const [activeSlideout, setActiveSlideout] = useState<SlideoutState | null>(null);

  const openFile = useCallback((file: string, lines?: [number, number]) => {
    setActiveSlideout({ file, lines });
  }, []);

  const closeFile = useCallback(() => {
    setActiveSlideout(null);
  }, []);

  const githubFileUrl = useCallback((file: string) => {
    return `${githubUrl}/${owner}/${repo}/blob/${headSha}/${file}`;
  }, [githubUrl, owner, repo, headSha]);

  return (
    <SlideoutContext.Provider value={{ activeSlideout, openFile, closeFile, githubFileUrl }}>
      {children}
    </SlideoutContext.Provider>
  );
}

export function useSlideout() {
  return useContext(SlideoutContext);
}
