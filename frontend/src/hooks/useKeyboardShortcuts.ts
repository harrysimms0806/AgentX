import { useEffect, useRef, useCallback } from 'react';

export type KeyboardShortcut = {
  id: string;
  keys: string[];
  handler: () => void;
  description?: string;
  /** Prevent shortcut when user is typing in input/textarea */
  preventWhenTyping?: boolean;
};

export type KeySequence = {
  firstKey: string;
  secondKey: string;
};

// Platform detection
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Format keys for display
export function formatShortcut(keys: string[]): string {
  return keys.map((key) => {
    if (key === 'Meta') return isMac ? '⌘' : 'Ctrl';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Shift') return isMac ? '⇧' : 'Shift';
    if (key === 'Alt') return isMac ? '⌥' : 'Alt';
    if (key === 'Escape') return 'Esc';
    return key;
  }).join(' + ');
}

// Check if user is typing in an input field
function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  if (!target) return false;
  
  const tagName = target.tagName.toLowerCase();
  const editable = target.getAttribute('contenteditable') === 'true';
  const inputTypes = ['input', 'textarea', 'select'];
  
  return inputTypes.includes(tagName) || editable;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  /** Enable sequence mode (for "G then D" style shortcuts) */
  sequences?: KeySequence[];
  /** Global handler for sequences */
  onSequence?: (firstKey: string, secondKey: string) => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const { shortcuts, sequences = [], onSequence } = options;
  const sequenceRef = useRef<{ key: string; timestamp: number } | null>(null);
  const SEQUENCE_TIMEOUT = 1000; // 1 second to complete sequence

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Check for typing targets if shortcut prevents it
    const typing = isTypingTarget(event);

    // Handle modifier + key combinations
    for (const shortcut of shortcuts) {
      const { keys, handler, preventWhenTyping = true } = shortcut;
      
      // Skip if typing and shortcut prevents it
      if (typing && preventWhenTyping) continue;

      // Check if this shortcut matches
      if (matchesShortcut(event, keys)) {
        event.preventDefault();
        handler();
        return;
      }
    }

    // Handle key sequences (like "G then D")
    if (sequences.length > 0 && onSequence && !typing) {
      const now = Date.now();
      const key = event.key.toLowerCase();

      // Check if we're in a sequence
      if (sequenceRef.current) {
        const { key: firstKey, timestamp } = sequenceRef.current;
        
        // Check if sequence timed out
        if (now - timestamp > SEQUENCE_TIMEOUT) {
          sequenceRef.current = null;
        } else {
          // Check if this completes a valid sequence
          const validSequence = sequences.find(
            (seq) => seq.firstKey.toLowerCase() === firstKey && seq.secondKey.toLowerCase() === key
          );

          if (validSequence) {
            event.preventDefault();
            onSequence(firstKey, key);
            sequenceRef.current = null;
            return;
          } else {
            // Invalid second key, reset
            sequenceRef.current = null;
          }
        }
      }

      // Check if this could start a sequence
      const canStartSequence = sequences.some((seq) => seq.firstKey.toLowerCase() === key);
      if (canStartSequence) {
        sequenceRef.current = { key, timestamp: now };
      }
    }
  }, [shortcuts, sequences, onSequence]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Check if keyboard event matches shortcut keys
function matchesShortcut(event: KeyboardEvent, keys: string[]): boolean {
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  
  // Check main key
  const mainKey = keys.find((k) => 
    !['meta', 'control', 'shift', 'alt', 'cmd', 'ctrl'].includes(k.toLowerCase())
  );
  
  if (!mainKey) return false;
  if (event.key.toLowerCase() !== mainKey.toLowerCase()) return false;

  // Check modifiers
  const needsMeta = keySet.has('meta') || keySet.has('cmd');
  const needsCtrl = keySet.has('control') || keySet.has('ctrl');
  const needsShift = keySet.has('shift');
  const needsAlt = keySet.has('alt');

  const hasMeta = event.metaKey;
  const hasCtrl = event.ctrlKey;
  const hasShift = event.shiftKey;
  const hasAlt = event.altKey;

  // Meta/Cmd is used on Mac, Ctrl on Windows/Linux
  if (isMac) {
    if (needsMeta !== hasMeta) return false;
    if (needsCtrl !== hasCtrl) return false;
  } else {
    // On non-Mac, treat Cmd as Ctrl
    if (needsMeta && !hasCtrl) return false;
    if (needsCtrl && !hasCtrl) return false;
  }

  if (needsShift !== hasShift) return false;
  if (needsAlt !== hasAlt) return false;

  return true;
}

// Hook for system theme detection
export function useSystemTheme() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Dispatch custom event that App.tsx can listen to
      window.dispatchEvent(new CustomEvent('system-theme-change', { 
        detail: { isDark: e.matches } 
      }));
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
}

// Get current system theme preference
export function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
