import { ensureAttached, sendCdp } from './cdp'

export interface PageElement {
  encodedId: string
  backendNodeId: number
  role: string
  name: string
  tag?: string
  interactable: boolean
  focused?: boolean
  value?: string
  description?: string
}

export interface PageSnapshot {
  url: string
  title: string
  elements: PageElement[]
  tree: string
}

interface AXNode {
  nodeId: string
  backendDOMNodeId?: number
  role?: { type: string; value: string }
  name?: { type: string; value: string }
  description?: { type: string; value: string }
  value?: { type: string; value: string }
  properties?: Array<{ name: string; value: { type: string; value: unknown } }>
  childIds?: string[]
  parentId?: string
  ignored?: boolean
}

const INTERACTABLE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
  'switch', 'tab', 'menuitem', 'option', 'searchbox', 'slider',
  'spinbutton', 'select', 'menuitemcheckbox', 'menuitemradio',
  'treeitem',
])

const SKIP_ROLES = new Set([
  'generic', 'none', 'presentation', 'InlineTextBox',
  'LineBreak', 'StaticText', 'group', 'paragraph',
  'list', 'listitem', 'LayoutTableCell', 'LayoutTable',
  'LayoutTableRow',
])

function getProperty(node: AXNode, name: string): unknown {
  const prop = node.properties?.find((p) => p.name === name)
  return prop?.value?.value
}

function isInteractableNode(node: AXNode): boolean {
  const role = node.role?.value
  if (!role) return false
  if (INTERACTABLE_ROLES.has(role)) return true
  // focusable or editable nodes are interactable
  if (getProperty(node, 'focusable') === true) return true
  if (getProperty(node, 'editable') === 'plaintext' || getProperty(node, 'editable') === 'richtext') return true
  return false
}

function shouldIncludeNode(node: AXNode): boolean {
  if (node.ignored) return false
  const role = node.role?.value || ''
  const name = node.name?.value || ''

  // Always include interactable nodes with a name
  if (isInteractableNode(node) && name) return true

  // Skip structural-only roles without meaningful content
  if (SKIP_ROLES.has(role)) return false

  // Include named nodes (headings, images, etc.)
  if (name && role) return true

  return false
}

function formatNodeLine(el: PageElement): string {
  let line = `[${el.backendNodeId}] ${el.role}: "${el.name}"`
  if (el.value !== undefined) line += ` value="${el.value}"`
  if (el.focused) line += ' (focused)'
  if (el.description) line += ` description="${el.description}"`
  return line
}

export async function capturePageSnapshot(tabId: number): Promise<PageSnapshot> {
  await ensureAttached(tabId)
  await sendCdp(tabId, 'Accessibility.enable')

  const { nodes } = await sendCdp<{ nodes: AXNode[] }>(
    tabId,
    'Accessibility.getFullAXTree',
  )

  const elements: PageElement[] = []
  const treeLines: string[] = []

  // Build parent→children map for tree indentation
  const nodeMap = new Map<string, AXNode>()
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node)
  }

  // Compute depth for each node
  const depthMap = new Map<string, number>()
  function getDepth(nodeId: string): number {
    if (depthMap.has(nodeId)) return depthMap.get(nodeId)!
    const node = nodeMap.get(nodeId)
    if (!node?.parentId) {
      depthMap.set(nodeId, 0)
      return 0
    }
    const d = getDepth(node.parentId) + 1
    depthMap.set(nodeId, d)
    return d
  }

  for (const node of nodes) {
    if (!shouldIncludeNode(node)) continue
    if (!node.backendDOMNodeId) continue

    const role = node.role?.value || 'unknown'
    const name = node.name?.value || ''
    const interactable = isInteractableNode(node)
    const focused = getProperty(node, 'focused') === true
    const value = node.value?.value
    const description = node.description?.value

    const el: PageElement = {
      encodedId: String(node.backendDOMNodeId),
      backendNodeId: node.backendDOMNodeId,
      role,
      name,
      interactable,
      focused: focused || undefined,
      value: value || undefined,
      description: description || undefined,
    }

    elements.push(el)

    const depth = getDepth(node.nodeId)
    const indent = '  '.repeat(depth)
    treeLines.push(indent + formatNodeLine(el))

    // Cap at 500 elements
    if (elements.length >= 500) break
  }

  // Get page URL and title
  const { targetInfo } = await sendCdp<{
    targetInfo: { url: string; title: string }
  }>(tabId, 'Target.getTargetInfo')

  return {
    url: targetInfo.url,
    title: targetInfo.title,
    elements,
    tree: treeLines.join('\n'),
  }
}
