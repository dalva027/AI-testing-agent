import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/Dialog'
import { Settings, Globe, FileText, Save, X } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

// Accept only a syntactically valid http(s) URL (after trimming).
function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

interface Props {
  repo: {
    id: number
    target_domain: string | null
    global_instruction: string | null
  }
  onSaved: () => void
  // Optional controlled mode, used by Workspace to auto-open the dialog right
  // after a repo is connected. Omit both to keep the self-managed gear button.
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function RepoSettingsDialog({ repo, onSaved, open, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setOpen = (o: boolean) => {
    if (!isControlled) setInternalOpen(o)
    onOpenChange?.(o)
  }

  const [targetDomain, setTargetDomain] = useState(repo.target_domain || '')
  const [globalInstruction, setGlobalInstruction] = useState(repo.global_instruction || '')
  const [saving, setSaving] = useState(false)

  // Re-sync from the repo each time the dialog opens: the component stays
  // mounted while closed, so state would otherwise go stale after saves.
  useEffect(() => {
    if (isOpen) {
      setTargetDomain(repo.target_domain || '')
      setGlobalInstruction(repo.global_instruction || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Empty is allowed (leaves the URL unset — runs stay disabled); anything
  // typed must be a valid http(s) URL.
  const trimmedDomain = targetDomain.trim()
  const targetDomainValid = trimmedDomain === '' || isValidHttpUrl(trimmedDomain)

  const handleSave = async () => {
    if (!targetDomainValid) {
      toast.error('Enter a valid target domain (http:// or https://)')
      return
    }
    setSaving(true)
    try {
      await axios.patch(`/api/repos/${repo.id}`, {
        target_domain: trimmedDomain || null,
        global_instruction: globalInstruction || null,
      })
      toast.success('Repository settings saved')
      setOpen(false)
      onSaved()
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button aria-label="Repository settings" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Repository Settings</DialogTitle>
          <DialogDescription>
            Configure target domain and global instructions for this repository.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              Target Domain
            </label>
            <input
              type="text"
              autoFocus
              value={targetDomain}
              onChange={e => setTargetDomain(e.target.value)}
              className={`input font-mono text-sm ${!targetDomainValid ? 'border-rose-400 focus:ring-rose-500' : ''}`}
              placeholder="https://your-app.example.com"
            />
            {!targetDomainValid ? (
              <p className="text-xs text-rose-600">Enter a valid URL starting with http:// or https://</p>
            ) : trimmedDomain === '' ? (
              <p className="text-xs text-amber-700">Test runs are disabled until this is set.</p>
            ) : (
              <p className="text-xs text-gray-500">The URL where your app is running for testing</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Global Instructions
            </label>
            <textarea
              value={globalInstruction}
              onChange={e => setGlobalInstruction(e.target.value)}
              className="input text-sm h-24 resize-none"
              placeholder="Any additional instructions for the AI test generator..."
            />
            <p className="text-xs text-gray-500">These instructions will be included when generating test cases</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={() => setOpen(false)} className="btn-secondary text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !targetDomainValid} className="btn-primary text-sm inline-flex items-center gap-1.5">
            {saving ? <X className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
