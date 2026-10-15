import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,transform,color] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-ink text-white shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_1px_2px_rgb(17_17_17/0.2),0_4px_12px_-4px_rgb(17_17_17/0.35)] hover:bg-ink-2 hover:-translate-y-px hover:shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_2px_4px_rgb(17_17_17/0.2),0_10px_20px_-8px_rgb(17_17_17/0.45)]',
        accent:
          'bg-crema-strong text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(140_95_54/0.3),0_6px_14px_-6px_rgb(140_95_54/0.6)] hover:bg-[#7a5230] hover:-translate-y-px',
        destructive: 'bg-bad text-white hover:bg-bad/90 focus-visible:ring-bad/25',
        outline:
          'border border-line-strong bg-surface text-ink shadow-card hover:border-ink/40 hover:bg-[#fbfaf7] hover:-translate-y-px',
        secondary: 'bg-surface-2 text-ink hover:bg-[#e6e1d7]',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        link: 'text-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 has-[>svg]:px-3.5',
        xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px] has-[>svg]:px-2.5',
        lg: 'h-11 px-5 text-[15px] has-[>svg]:px-4',
        icon: 'size-10',
        'icon-xs': "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-lg',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
