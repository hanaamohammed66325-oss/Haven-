'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NOTES_ENABLED } from '@/lib/featureFlags';
export function OutsideNotes({ children }: { children: ReactNode }) {
  const path = usePathname()?.replace(/\/+$/, '');
  return NOTES_ENABLED && (path === '/notes' || path === '/notes-preview' || path?.startsWith('/notes/')) ? null : children;
}
