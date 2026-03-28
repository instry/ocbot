import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PrimaryActionButtonProps extends Omit<ButtonProps, 'variant'> {
  icon?: ReactNode
  fullWidth?: boolean
}

export function PrimaryActionButton({
  children,
  className,
  size = 'sm',
  icon = <Plus className="h-4 w-4" />,
  fullWidth = false,
  ...props
}: PrimaryActionButtonProps) {
  return (
    <Button
      variant="tonal"
      size={size}
      className={cn(fullWidth && 'w-full', className)}
      {...props}
    >
      {icon}
      {children}
    </Button>
  )
}
