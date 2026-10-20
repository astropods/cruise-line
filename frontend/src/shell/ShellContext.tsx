import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface ShellContextValue {
  /** A side panel (the file slideout) is open, so the inbox sidebar steps aside */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue>({ panelOpen: false, setPanelOpen: () => {} });

export function ShellProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  return <ShellContext.Provider value={{ panelOpen, setPanelOpen }}>{children}</ShellContext.Provider>;
}

export function useShell() {
  return useContext(ShellContext);
}

/** Tell the shell a panel is open while `open` is true, and closed on unmount */
export function useShellPanel(open: boolean) {
  const { setPanelOpen } = useShell();
  useEffect(() => {
    setPanelOpen(open);
    return () => setPanelOpen(false);
  }, [open, setPanelOpen]);
}
