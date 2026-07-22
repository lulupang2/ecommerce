import { cn } from '@/lib/utils';
export function Card({ className, ...props }) { return <article className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white', className)} {...props} />; }
