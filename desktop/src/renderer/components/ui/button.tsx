import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-medium transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-accent/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border-button-primary bg-button-primary text-button-primary-foreground shadow-sm hover:bg-button-primary-hover hover:shadow-md',
        secondary: 'border-button-secondary-border bg-button-secondary text-button-secondary-foreground shadow-sm hover:border-border-hover hover:bg-button-secondary-hover',
        ghost: 'border-transparent bg-transparent text-muted-foreground shadow-none hover:border-border hover:bg-bg-hover hover:text-text-strong',
        tonal: 'border-button-tonal-border bg-button-tonal text-button-tonal-foreground shadow-sm hover:bg-button-tonal-hover',
        danger: 'border-button-danger-border bg-button-danger text-button-danger-foreground hover:bg-button-danger-hover',
        dangerSolid: 'border-button-danger-solid bg-button-danger-solid text-button-danger-solid-foreground shadow-sm hover:bg-button-danger-solid-hover',
        success: 'border-button-success-border bg-button-success text-button-success-foreground shadow-sm hover:bg-button-success-hover',
        segment: 'rounded-full border-button-secondary-border bg-transparent text-text shadow-none hover:bg-bg-hover',
        segmentActive: 'rounded-full border-button-tonal-border bg-button-tonal text-button-tonal-foreground shadow-sm hover:bg-button-tonal-hover',
      },
      size: {
        xs: 'h-8 px-3 text-xs',
        sm: 'h-9 px-3.5',
        md: 'h-10 px-4',
        lg: 'h-11 px-5',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'sm',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
