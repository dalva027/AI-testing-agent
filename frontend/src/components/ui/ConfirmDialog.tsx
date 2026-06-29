import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './Dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

/**
 * Styled replacement for the browser's native confirm(). Built on the existing
 * Dialog primitive, so it inherits overlay-click and Escape-to-cancel.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="p-5 flex justify-end gap-3">
          <button onClick={() => onOpenChange(false)} className="btn-secondary text-sm">
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
            className={
              destructive
                ? 'text-sm font-medium px-4 py-2 rounded-lg text-white bg-rose-600 hover:bg-rose-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2'
                : 'btn-primary text-sm'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
