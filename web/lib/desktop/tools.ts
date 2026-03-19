import type { ToolDefinition } from '../llm/types'

// Promisify chrome.ocbot callback-style APIs
function promisify<T>(fn: (...args: any[]) => void, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      fn(...args, (result: T) => resolve(result))
    } catch (e) {
      reject(e)
    }
  })
}

export const DESKTOP_TOOLS: ToolDefinition[] = [
  {
    name: 'desktop_screenshot',
    description: 'Capture a screenshot of the entire macOS screen. Returns the image for visual inspection of desktop state.',
    parameters: {
      type: 'object',
      properties: {
        maxWidth: { type: 'number', description: 'Optional max width to downscale (default: full resolution)' },
      },
    },
  },
  {
    name: 'desktop_tree',
    description: 'Get the accessibility tree of a running macOS application. Shows all UI elements with roles, names, positions and node IDs. Use to understand app UI before clicking.',
    parameters: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Process ID of the app. If omitted, uses the frontmost app.' },
      },
    },
  },
  {
    name: 'desktop_click',
    description: 'Click at screen coordinates on the macOS desktop.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X screen coordinate' },
        y: { type: 'number', description: 'Y screen coordinate' },
        button: { type: 'string', description: 'Click type', enum: ['left', 'right', 'double'] },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'desktop_type',
    description: 'Type text using keyboard events on the macOS desktop. Types into whatever app/field is currently focused.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'desktop_key',
    description: 'Press a key with optional modifiers. Use for keyboard shortcuts and special keys.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name (e.g. "Return", "Tab", "Escape", "a", "F5")' },
        modifiers: {
          type: 'string',
          description: 'Comma-separated modifiers: "shift", "control", "option", "command"',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'open_app',
    description: 'Launch a macOS application by name.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Application name (e.g. "Terminal", "Safari", "Finder")' },
      },
      required: ['name'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command on macOS and return stdout/stderr/exitCode.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_applescript',
    description: 'Execute an AppleScript on macOS. Useful for automating apps, system dialogs, and macOS-specific tasks.',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'AppleScript source code' },
      },
      required: ['script'],
    },
  },
  {
    name: 'desktop_scroll',
    description: 'Scroll at a specific screen position on the macOS desktop.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X screen coordinate' },
        y: { type: 'number', description: 'Y screen coordinate' },
        deltaX: { type: 'number', description: 'Horizontal scroll amount (default 0)' },
        deltaY: { type: 'number', description: 'Vertical scroll amount (negative = up, positive = down)' },
      },
      required: ['x', 'y', 'deltaY'],
    },
  },
]

const DESKTOP_TOOL_NAMES = new Set(DESKTOP_TOOLS.map(t => t.name))

export function isDesktopTool(name: string): boolean {
  return DESKTOP_TOOL_NAMES.has(name)
}

function parseModifiers(modStr?: string): number {
  if (!modStr) return 0
  let flags = 0
  const mods = modStr.toLowerCase().split(',').map(s => s.trim())
  if (mods.includes('shift')) flags |= 1
  if (mods.includes('control')) flags |= 2
  if (mods.includes('option')) flags |= 4
  if (mods.includes('command')) flags |= 8
  return flags
}

function serializeTree(node: chrome.ocbot.TreeNode, indent = 0): string {
  const pad = '  '.repeat(indent)
  let line = `${pad}[${node.nodeId}] ${node.role}`
  if (node.name) line += ` "${node.name}"`
  if (node.value) line += ` value="${node.value}"`
  if (node.x != null && node.y != null) {
    line += ` (${node.x},${node.y} ${node.width}x${node.height})`
  }
  const lines = [line]
  if (node.children) {
    for (const child of node.children) {
      lines.push(serializeTree(child, indent + 1))
    }
  }
  return lines.join('\n')
}

export async function executeDesktopTool(
  name: string,
  argsJson: string,
): Promise<string> {
  try {
    const args = JSON.parse(argsJson || '{}')

    switch (name) {
      case 'desktop_screenshot': {
        const result = await promisify<chrome.ocbot.ScreenshotResult>(
          chrome.ocbot.captureScreen, args.maxWidth ?? undefined,
        )
        // Return special marker like browser screenshot — loop.ts injects image
        const base64 = result.dataUrl.replace(/^data:image\/jpeg;base64,/, '')
        return JSON.stringify({
          __screenshot__: true,
          data: base64,
          sizeKB: Math.round(base64.length / 1024),
          width: result.width,
          height: result.height,
        })
      }

      case 'desktop_tree': {
        const tree = await promisify<chrome.ocbot.DesktopTree>(
          chrome.ocbot.getDesktopTree, args.pid ?? undefined,
        )
        const serialized = serializeTree(tree.root)
        const maxLen = 70000
        const truncated = serialized.length > maxLen
          ? serialized.slice(0, maxLen) + '\n... (truncated)'
          : serialized
        return JSON.stringify({
          appName: tree.appName,
          pid: tree.pid,
          tree: truncated,
        })
      }

      case 'desktop_click': {
        const button = args.button || 'left'
        if (button === 'double') {
          await promisify<void>(chrome.ocbot.doubleClick, args.x, args.y)
        } else if (button === 'right') {
          await promisify<void>(chrome.ocbot.rightClick, args.x, args.y)
        } else {
          await promisify<void>(chrome.ocbot.click, args.x, args.y)
        }
        return JSON.stringify({ success: true, x: args.x, y: args.y, button })
      }

      case 'desktop_type': {
        await promisify<void>(chrome.ocbot.type, args.text)
        return JSON.stringify({ success: true, typed: args.text.length + ' chars' })
      }

      case 'desktop_key': {
        const modFlags = parseModifiers(args.modifiers)
        await promisify<void>(
          chrome.ocbot.pressKey, args.key, modFlags || undefined,
        )
        return JSON.stringify({ success: true, key: args.key, modifiers: args.modifiers })
      }

      case 'open_app': {
        await promisify<void>(chrome.ocbot.launchApp, args.name)
        return JSON.stringify({ success: true, app: args.name })
      }

      case 'run_command': {
        const result = await promisify<chrome.ocbot.CommandResult>(
          chrome.ocbot.runCommand,
          args.command,
          args.cwd ?? undefined,
          args.timeout ?? undefined,
        )
        return JSON.stringify(result)
      }

      case 'run_applescript': {
        const result = await promisify<chrome.ocbot.AppleScriptResult>(
          chrome.ocbot.runAppleScript, args.script,
        )
        return JSON.stringify(result)
      }

      case 'desktop_scroll': {
        await promisify<void>(
          chrome.ocbot.scroll,
          args.x, args.y,
          args.deltaX ?? 0, args.deltaY,
        )
        return JSON.stringify({ success: true, x: args.x, y: args.y, deltaY: args.deltaY })
      }

      default:
        return `Error: Unknown desktop tool "${name}"`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Error executing ${name}: ${msg}`
  }
}
