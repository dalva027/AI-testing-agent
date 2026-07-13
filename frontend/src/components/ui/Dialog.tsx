import * as React from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface DialogContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  onOpenChange: (v: boolean) => void
}

const DialogContext = createContext<DialogContextValue>({
  open: false,
  setOpen: () => {},
  onOpenChange: () => {},
})

export function Dialog({ open: controlledOpen, onOpenChange, children }: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const isControlled = controlledOpen !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setOpen = useCallback((v: boolean) => {
    // Only own the state when uncontrolled; otherwise defer to the parent.
    if (!isControlled) setInternalOpen(v)
    onOpenChange?.(v)
  }, [isControlled, onOpenChange])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, setOpen])

  // Always render children so the trigger stays mounted; the overlay/content
  // is gated on `open` inside DialogContent.
  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen, onOpenChange: onOpenChange || setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

export function DialogContent({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useContext(DialogContext)
  if (!open) return null
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={`bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col ${className}`}
          {...props}
        >
          {children}
        </div>
      </div>
    </>
  )
}

export function DialogHeader({ children, className = '' }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-5 border-b border-gray-200 ${className}`}>{children}</div>
}

export function DialogTitle({ children, className = '' }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`text-lg font-semibold text-gray-900 ${className}`}>{children}</h2>
}

export function DialogDescription({ children, className = '' }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-gray-500 mt-1 ${className}`}>{children}</p>
}

export function DialogFooter({ children, className = '' }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-5 border-t border-gray-200 flex justify-end gap-3 ${className}`}>{children}</div>
}

export function DialogClose({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { setOpen } = useContext(DialogContext)
  return (
    <button onClick={() => setOpen(false)} className={className}>
      {children}
    </button>
  )
}

export function DialogTrigger({ children }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = useContext(DialogContext)
  const child = children as React.ReactElement<any>
  return React.cloneElement(child, {
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e)
      setOpen(true)
    },
  })
}
