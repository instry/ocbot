import { Settings } from 'lucide-react'

export function SettingsRoute() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <Settings className="h-10 w-10 text-muted-foreground" />
      <span className="text-lg font-medium text-text-strong">Settings</span>
      <span className="text-sm text-muted-foreground">Coming soon</span>
    </div>
  )
}
