import type { FC } from 'react'

export const App: FC = () => {
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold">ocbot</h1>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Hello from ocbot!</p>
      </main>
    </div>
  )
}
