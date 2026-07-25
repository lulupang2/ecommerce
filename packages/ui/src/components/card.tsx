import { cn } from '../utils';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white', className)} {...props} />;
}
