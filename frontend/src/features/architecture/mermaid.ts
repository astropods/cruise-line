type Mermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<Mermaid> | null = null;

/** Mermaid, loaded on first use and themed from the app's color tokens */
export function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid')
    .then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeFromTokens() });
      return mermaid;
    })
    .catch((err: unknown) => {
      mermaidPromise = null;
      throw err;
    });
  return mermaidPromise;
}

function themeFromTokens() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(`--color-${name}`).trim();
  const surface = token('surface');
  const raised = token('raised');
  const fgStrong = token('fg-strong');
  const fg = token('fg');
  const accent = token('accent');
  return {
    background: surface,
    primaryColor: raised,
    primaryBorderColor: accent,
    primaryTextColor: fgStrong,
    lineColor: token('fg-muted'),
    secondaryColor: token('canvas'),
    tertiaryColor: raised,
    actorBkg: raised,
    actorBorder: accent,
    actorTextColor: fgStrong,
    signalColor: fg,
    signalTextColor: fg,
    noteBkgColor: raised,
    noteTextColor: fg,
    noteBorderColor: token('line'),
  };
}
