import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const variants = cva('inline-flex items-center justify-center rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'bg-slate-950 text-white hover:bg-blue-600', outline: 'border border-slate-300 bg-white hover:border-slate-950', ghost: 'hover:bg-slate-100' }, size: { default: 'h-11 px-5', sm: 'h-9 px-3 text-xs', icon: 'h-10 w-10' } },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({ className, variant, size, ...props }) { return <button className={cn(variants({ variant, size }), className)} {...props} />; }
