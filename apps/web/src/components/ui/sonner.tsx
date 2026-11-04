import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useTheme } from '@/hooks/useTheme'

function Toaster({ ...props }: ToasterProps) {
  // Follow the app theme: sonner defaults to light, which left light toasts on a dark page
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-foreground group-[.toast]:text-background group-[.toast]:hover:opacity-90',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          closeButton:
            'group-[.toast]:bg-card group-[.toast]:text-foreground group-[.toast]:border-border group-[.toast]:hover:bg-muted',
          success:
            'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-emerald-500/30',
          error:
            'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-destructive/30',
          warning:
            'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-amber-500/30',
          info: 'group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-blue-500/30',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
