import { useState } from 'react'
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
}

export default function RepoSettingsDialog({ repo, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [targetDomain, setTargetDomain] = useState(repo.target_domain || 'http://localhost:5173')
  const [globalInstruction, setGlobalInstruction] = useState(repo.global_instruction || '')
  const [saving, setSaving] = useState(false)
  const targetDomainValid = isValidHttpUrl(targetDomain)

  const handleSave = async () => {
    if (!targetDomainValid) {
      toast.error('Enter a valid target domain (http:// or https://)')
      return
    }
    setSaving(true)
    try {
      await axios.patch(`/api/repos/${repo.id}`, {
        target_domain: targetDomain.trim(),
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
    <Dialog open={open} onOpenChange={setOpen}>
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
              value={targetDomain}
              onChange={e => setTargetDomain(e.target.value)}
              className={`input font-mono text-sm ${!targetDomainValid ? 'border-rose-400 focus:ring-rose-500' : ''}`}
              placeholder="http://localhost:5173"
            />
            {targetDomainValid ? (
              <p className="text-xs text-gray-500">The URL where your app is running for testing</p>
            ) : (
              <p className="text-xs text-rose-600">Enter a valid URL starting with http:// or https://</p>
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
