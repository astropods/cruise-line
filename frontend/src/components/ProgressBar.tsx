import { useState, useEffect } from 'react';

export function ProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf: number;
    function update() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0);
      raf = requestAnimationFrame(update);
    }
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[2px] z-50 pointer-events-none"
      style={{ opacity: progress > 0.01 ? 1 : 0, transition: 'opacity 0.3s' }}
    >
      <div
        className="h-full bg-[var(--accent)]"
        style={{
          transform: `scaleX(${progress})`,
          transformOrigin: 'left',
          transition: 'transform 0.1s linear',
        }}
      />
    </div>
  );
}
