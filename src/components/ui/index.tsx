'use client';

// FinAInce design-system primitives (design/06). Radix provides behaviour; the look is our own.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Dialog as RDialog, Popover as RPopover, Switch as RSwitch } from 'radix-ui';
import { X } from 'lucide-react';

export const cx = clsx;

type ButtonVariant = 'ghost' | 'subtle' | 'primary' | 'outline';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; active?: boolean }
>(function Button({ variant = 'ghost', size = 'md', active, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        variant === 'ghost' && 'text-ink hover:bg-surface-2',
        variant === 'subtle' && 'bg-surface-2 text-ink hover:bg-grid',
        variant === 'outline' && 'border border-line bg-surface text-ink hover:bg-surface-2',
        variant === 'primary' && 'bg-accent text-white hover:opacity-90',
        active && 'bg-accent-soft text-accent hover:bg-accent-soft',
        className,
      )}
      {...props}
    />
  );
});

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <Button aria-label={label} title={label} className={cx('w-8 px-0', className)} {...props}>
      {children}
    </Button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-lg bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center justify-center gap-1 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, info }: { label: ReactNode; hint?: ReactNode; info?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-xs font-medium text-muted">
        <span>{label}</span>
        {info && (
          <span className="cursor-help rounded-full border border-line px-1 text-[10px] leading-4" title={info}>
            i
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx('h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink', className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <RSwitch.Root
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-grid transition-colors data-[state=checked]:bg-accent"
      >
        <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
    </label>
  );
}

export function NumberSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer"
      />
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="tabular h-7 w-16 rounded-md border border-line bg-surface px-1.5 text-right text-sm"
      />
      {format && <span className="w-20 text-xs text-muted">{format(value)}</span>}
    </div>
  );
}

export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;

export function PopoverContent({ children, className, align = 'start' }: { children: ReactNode; className?: string; align?: 'start' | 'center' | 'end' }) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        sideOffset={6}
        className={cx('animate-fade z-50 rounded-xl border border-line bg-surface p-3 shadow-pop', className)}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="animate-fade fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <RDialog.Content
          className={cx(
            'animate-fade fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-pop',
            wide ? 'max-w-4xl' : 'max-w-lg',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RDialog.Title className="text-base font-semibold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <IconButton label="Close">
                <X size={16} />
              </IconButton>
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Chip({ children, onClick, title, tone = 'default' }: { children: ReactNode; onClick?: () => void; title?: string; tone?: 'default' | 'warn' | 'accent' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-medium backdrop-blur transition-colors',
        tone === 'default' && 'border-line bg-surface/80 text-ink hover:bg-surface-2',
        tone === 'warn' && 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/20',
        tone === 'accent' && 'border-accent/30 bg-accent-soft text-accent',
      )}
    >
      {children}
    </button>
  );
}
