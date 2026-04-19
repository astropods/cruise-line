import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SlideoutState {
  file: string;
  lines?: [number, number];
}

interface SlideoutContextValue {
  activeSlideout: SlideoutState | null;
  openFile: (file: string, lines?: [number, number]) => void;
  closeFile: () => void;
}

const SlideoutContext = createContext<SlideoutContextValue>({
  activeSlideout: null,
  openFile: () => {},
  closeFile: () => {},
});

export function SlideoutProvider({ children }: { children: ReactNode }) {
  const [activeSlideout, setActiveSlideout] = useState<SlideoutState | null>(null);

  const openFile = useCallback((file: string, lines?: [number, number]) => {
    setActiveSlideout({ file, lines });
  }, []);

  const closeFile = useCallback(() => {
    setActiveSlideout(null);
  }, []);

  return (
    <SlideoutContext.Provider value={{ activeSlideout, openFile, closeFile }}>
      {children}
    </SlideoutContext.Provider>
  );
}

export function useSlideout() {
  return useContext(SlideoutContext);
}
