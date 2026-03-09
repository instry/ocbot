import { useState, useRef, useCallback } from 'react'

interface OriginalState {
  btnText: string
  btnId: string
  btnClass: string
  inputVisible: boolean
  selectVisible: boolean
  formVisible: boolean
  btnVisible: boolean
  layoutSwapped: boolean
  disabledBtnVisible: boolean
}

const INITIAL_STATE: OriginalState = {
  btnText: 'Click Me',
  btnId: 'test-btn-1',
  btnClass: 'test-button',
  inputVisible: true,
  selectVisible: true,
  formVisible: true,
  btnVisible: true,
  layoutSwapped: false,
  disabledBtnVisible: false,
}

export function App() {
  const [state, setState] = useState<OriginalState>(INITIAL_STATE)
  const [clickCount, setClickCount] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [selectValue, setSelectValue] = useState('')
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [log, setLog] = useState<string[]>([])

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const handleClick = useCallback(() => {
    setClickCount((c) => c + 1)
    addLog(`Button clicked (count: ${clickCount + 1})`)
  }, [clickCount, addLog])

  const mutateButton = useCallback(() => {
    setState((s) => ({
      ...s,
      btnText: 'Submit Now',
      btnId: 'mutated-btn',
      btnClass: 'mutated-button primary-action',
    }))
    addLog('Mutated button: text, id, class changed')
  }, [addLog])

  const removeButton = useCallback(() => {
    setState((s) => ({ ...s, btnVisible: false }))
    addLog('Removed button entirely')
  }, [addLog])

  const swapLayout = useCallback(() => {
    setState((s) => ({ ...s, layoutSwapped: true }))
    addLog('Swapped layout: all elements replaced')
  }, [addLog])

  const addDisabledButton = useCallback(() => {
    setState((s) => ({ ...s, disabledBtnVisible: true }))
    addLog('Added disabled button')
  }, [addLog])

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
    setClickCount(0)
    setInputValue('')
    setSelectValue('')
    setFormData({ email: '', password: '' })
    addLog('Reset to original state')
  }, [addLog])

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">ocbot Test Target</h1>

      {/* Mutation Controls */}
      <div className="mb-8 rounded-lg border border-border bg-muted/30 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Mutation Controls
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={mutateButton}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Mutate Button
          </button>
          <button
            onClick={removeButton}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Remove Button
          </button>
          <button
            onClick={swapLayout}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            Swap Layout
          </button>
          <button
            onClick={addDisabledButton}
            className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            Add Disabled Button
          </button>
          <button
            onClick={reset}
            className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Test Elements */}
      {!state.layoutSwapped ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Test Elements</h2>

            {/* Button */}
            {state.btnVisible && (
              <div className="mb-4">
                <button
                  id={state.btnId}
                  data-testid="test-btn-1"
                  className={`rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 ${state.btnClass}`}
                  onClick={handleClick}
                >
                  {state.btnText}
                </button>
                {clickCount > 0 && (
                  <span className="ml-3 text-sm text-muted-foreground">
                    Clicked {clickCount} time{clickCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Disabled Button (inserted on demand) */}
            {state.disabledBtnVisible && (
              <div className="mb-4">
                <button
                  data-testid="test-btn-disabled"
                  className="rounded bg-blue-600 px-4 py-2 text-white opacity-50 cursor-not-allowed"
                  disabled
                >
                  Click Me
                </button>
                <span className="ml-3 text-sm text-red-400">
                  (disabled decoy)
                </span>
              </div>
            )}

            {/* Text Input */}
            {state.inputVisible && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-foreground">Text Input</label>
                <input
                  data-testid="test-input-1"
                  type="text"
                  placeholder="Type something..."
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value)
                    addLog(`Input changed: "${e.target.value}"`)
                  }}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground"
                />
              </div>
            )}

            {/* Select Dropdown */}
            {state.selectVisible && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-foreground">Select</label>
                <select
                  data-testid="test-select-1"
                  value={selectValue}
                  onChange={(e) => {
                    setSelectValue(e.target.value)
                    addLog(`Select changed: "${e.target.value}"`)
                  }}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="">Choose an option...</option>
                  <option value="alpha">Alpha</option>
                  <option value="beta">Beta</option>
                  <option value="gamma">Gamma</option>
                </select>
              </div>
            )}

            {/* Form */}
            {state.formVisible && (
              <div className="rounded border border-border p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Login Form</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">Email</label>
                    <input
                      data-testid="test-email"
                      type="email"
                      placeholder="email@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
                      className="w-full rounded border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">Password</label>
                    <input
                      data-testid="test-password"
                      type="password"
                      placeholder="********"
                      value={formData.password}
                      onChange={(e) => setFormData((d) => ({ ...d, password: e.target.value }))}
                      className="w-full rounded border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground"
                    />
                  </div>
                  <button
                    data-testid="test-submit"
                    onClick={() => addLog(`Form submitted: ${formData.email}`)}
                    className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Swapped Layout — completely different structure */
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Alternate Layout</h2>
          <p className="text-muted-foreground">
            The original elements have been replaced. The skill must re-plan.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded border border-border p-4 text-center">
              <button
                data-testid="alt-action-1"
                onClick={() => addLog('Alt action 1 clicked')}
                className="rounded bg-teal-600 px-4 py-2 text-white hover:bg-teal-700"
              >
                Action A
              </button>
            </div>
            <div className="rounded border border-border p-4 text-center">
              <button
                data-testid="alt-action-2"
                onClick={() => addLog('Alt action 2 clicked')}
                className="rounded bg-teal-600 px-4 py-2 text-white hover:bg-teal-700"
              >
                Action B
              </button>
            </div>
          </div>
          <textarea
            data-testid="alt-textarea"
            placeholder="Alternative input area..."
            className="w-full rounded border border-border bg-background px-3 py-2 text-foreground placeholder-muted-foreground"
            rows={3}
          />
        </div>
      )}

      {/* Activity Log */}
      {log.length > 0 && (
        <div className="mt-8 rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Activity Log</h3>
          <div className="space-y-1 font-mono text-xs text-muted-foreground">
            {log.map((entry, i) => (
              <div key={i}>{entry}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
