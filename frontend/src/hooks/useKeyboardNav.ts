import { useEffect } from 'react';

interface KeyboardNavOptions {
  onPrev: () => void;
  onNext: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
}

export function useKeyboardNav({ onPrev, onNext, onPrevChapter, onNextChapter }: KeyboardNavOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'k':
        case 'p':
          e.preventDefault();
          onPrev();
          break;
        case 'ArrowRight':
        case 'j':
        case 'n':
          e.preventDefault();
          onNext();
          break;
        case '[':
          e.preventDefault();
          onPrevChapter();
          break;
        case ']':
          e.preventDefault();
          onNextChapter();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext, onPrevChapter, onNextChapter]);
}
