import { useCallback, useEffect, useRef, useState } from 'react';
import type { SegmentIndex } from '../lib/types';

/**
 * Hover controller with intent delay, close delay, pinning and lock (for context menus).
 * Keeps a deck open while the pointer is over its segment, its bridge zone or its icons.
 */
export function useReveal(hoverIntent: number, closeDelay: number) {
  const [active, setActive] = useState<SegmentIndex | null>(null);
  const [hovered, setHovered] = useState<SegmentIndex | null>(null);
  const [pinned, setPinned] = useState(false);
  const activeRef = useRef<SegmentIndex | null>(null);
  const locked = useRef(false);
  const pinnedRef = useRef(false);
  const intentT = useRef<number | undefined>(undefined);
  const closeT = useRef<number | undefined>(undefined);
  activeRef.current = active;
  pinnedRef.current = pinned;

  const cancelClose = useCallback(() => window.clearTimeout(closeT.current), []);

  const close = useCallback(() => {
    window.clearTimeout(closeT.current);
    window.clearTimeout(intentT.current);
    setPinned(false);
    setActive(null);
  }, []);

  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeT.current);
    if (locked.current || pinnedRef.current) return;
    closeT.current = window.setTimeout(() => {
      if (!locked.current && !pinnedRef.current) setActive(null);
    }, closeDelay);
  }, [closeDelay]);

  const enterSegment = useCallback(
    (i: SegmentIndex) => {
      cancelClose();
      setHovered(i);
      window.clearTimeout(intentT.current);
      if (activeRef.current === i) return;
      if (pinnedRef.current && activeRef.current !== null) return; // pinned deck stays until dismissed
      const delay = activeRef.current !== null ? Math.min(60, hoverIntent) : hoverIntent;
      intentT.current = window.setTimeout(() => setActive(i), delay);
    },
    [cancelClose, hoverIntent],
  );

  const leaveSegment = useCallback(() => {
    setHovered(null);
    window.clearTimeout(intentT.current);
    scheduleClose();
  }, [scheduleClose]);

  const clickSegment = useCallback(
    (i: SegmentIndex) => {
      window.clearTimeout(intentT.current);
      cancelClose();
      if (activeRef.current === i && pinnedRef.current) {
        setPinned(false);
        return;
      }
      setActive(i);
      setPinned(true);
    },
    [cancelClose],
  );

  const setLocked = useCallback(
    (v: boolean) => {
      locked.current = v;
      if (!v) scheduleClose();
    },
    [scheduleClose],
  );

  useEffect(() => () => {
    window.clearTimeout(closeT.current);
    window.clearTimeout(intentT.current);
  }, []);

  return { active, hovered, pinned, enterSegment, leaveSegment, clickSegment, enterGroup: cancelClose, leaveGroup: scheduleClose, close, setLocked };
}
