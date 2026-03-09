import { useState, useEffect, useCallback, useRef } from 'react'
import { Puzzle, ExternalLink, X } from 'lucide-react'
import { ChatArea } from '@/components/ChatArea'
import { ChatInput } from '@/components/ChatInput'
import type { ChatInputHandle } from '@/components/ChatInput'
import { SuggestionChips } from '@/components/SuggestionChips'
import { ChatList } from '@/components/ChatList'
import { SkillParamForm } from '@/components/SkillParamForm'
import { Header } from './components/Header'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { useChat } from '@/lib/hooks/useChat'
import type { ChannelStatus } from '@/lib/channels/types'

type View = 'chat' | 'chatList'

export function App() {
  const [view, setView] = useState<View>('chat')
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const {
    messages, conversationId, conversations, streamingText, isLoading,
    toolStatuses, error, sendMessage, runSkill, stopAgent, newChat,
    loadConversation, removeConversation,
    pendingSkillSave, saveAsSkill, dismissSkillSave,
    pendingSkillParams, prefillParams, confirmSkillParams, cancelSkillParams,
  } = useChat(selectedProvider)
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})
  const [skillSaving, setSkillSaving] = useState(false)
  const [skillSaved, setSkillSaved] = useState(false)
  const [savedSkillId, setSavedSkillId] = useState<string | null>(null)
  const pendingMessageRef = useRef<string | null>(null)
  const chatInputRef = useRef<ChatInputHandle>(null)

  // Process pending message once provider is ready
  useEffect(() => {
    if (pendingMessageRef.current && selectedProvider && !isLoading) {
      const text = pendingMessageRef.current
      pendingMessageRef.current = null
      // Skill run uses dedicated path (bypasses LLM agent loop)
      if (text.startsWith('__run_skill__:')) {
        const skillId = text.slice('__run_skill__:'.length)
        runSkill(skillId)
      } else {
        sendMessage(text)
      }
    }
  }, [selectedProvider, isLoading, sendMessage, runSkill])

  // Pick up pending message from home page (on mount)
  useEffect(() => {
    chrome.storage.local.get(['ocbot_pending_message', 'ocbot_load_conversation', 'ocbot_run_skill']).then(async result => {
      const skillId = result.ocbot_run_skill
      if (skillId && typeof skillId === 'string') {
        chrome.storage.local.remove('ocbot_run_skill')
        newChat()
        pendingMessageRef.current = `__run_skill__:${skillId}`
        return
      }
      const text = result.ocbot_pending_message
      if (text && typeof text === 'string') {
        chrome.storage.local.remove('ocbot_pending_message')
        newChat()
        pendingMessageRef.current = text
        return
      }
      const convId = result.ocbot_load_conversation
      if (convId && typeof convId === 'string') {
        chrome.storage.local.remove('ocbot_load_conversation')
        loadConversation(convId)
        setView('chat')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up pending message or load conversation when side panel is already open
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ocbot_run_skill?.newValue) {
        const skillId = changes.ocbot_run_skill.newValue
        chrome.storage.local.remove('ocbot_run_skill')
        newChat()
        pendingMessageRef.current = `__run_skill__:${skillId}`
      }
      if (changes.ocbot_pending_message?.newValue) {
        const text = changes.ocbot_pending_message.newValue
        chrome.storage.local.remove('ocbot_pending_message')
        newChat()
        pendingMessageRef.current = text
      }
      if (changes.ocbot_load_conversation?.newValue) {
        const convId = changes.ocbot_load_conversation.newValue
        chrome.storage.local.remove('ocbot_load_conversation')
        loadConversation(convId)
        setView('chat')
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [newChat, loadConversation])

  // Auto-dismiss skill saved toast after 3s
  useEffect(() => {
    if (!skillSaved) return
    const timer = setTimeout(() => setSkillSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [skillSaved])

  const refreshChannelStatuses = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'getChannelStatuses', timestamp: Date.now() }, (resp) => {
      if (resp?.ok) {
        setChannelStatuses(resp.statuses)
      }
    })
  }, [])

  // Poll statuses on mount and listen for updates
  useEffect(() => {
    refreshChannelStatuses()
    const interval = setInterval(refreshChannelStatuses, 5000)

    const listener = (message: { type: string; channelId: string; status: ChannelStatus }) => {
      if (message.type === 'channelStatusUpdate') {
        setChannelStatuses(prev => ({ ...prev, [message.channelId]: message.status }))
      }
    }
    chrome.runtime.onMessage.addListener(listener)

    return () => {
      clearInterval(interval)
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [refreshChannelStatuses])

  const handleSelectChat = useCallback((id: string) => {
    loadConversation(id)
    setView('chat')
  }, [loadConversation])

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <Header
        view={view === 'chatList' ? 'history' : 'chat'}
        onNewChat={() => { newChat(); setView('chat'); setSkillSaved(false) }}
        onToggleHistory={() => setView(v => v === 'chatList' ? 'chat' : 'chatList')}
        onClose={() => window.close()}
      />
      {view === 'chat' && (
        <>
          <ChatArea
            hasProvider={!!selectedProvider}
            messages={messages}
            streamingText={streamingText}
            isLoading={isLoading}
            toolStatuses={toolStatuses}
            error={error}
          />
          {pendingSkillParams && (
            <SkillParamForm
              skill={pendingSkillParams}
              prefill={prefillParams}
              onConfirm={confirmSkillParams}
              onCancel={cancelSkillParams}
            />
          )}
          {pendingSkillSave && !skillSaved && !skillSaving && (
            <div className="mx-3 my-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <Puzzle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm text-muted-foreground">Save this task as a Skill?</span>
              <button
                onClick={() => {
                  setSkillSaving(true)
                  saveAsSkill().then(skill => {
                    setSkillSaved(true)
                    if (skill) setSavedSkillId(skill.id)
                  }).catch(() => {}).finally(() => setSkillSaving(false))
                }}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                Save
              </button>
              <button
                onClick={() => dismissSkillSave()}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {skillSaved && (
            <div className="mx-3 my-2 flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm text-green-600 dark:text-green-400">
              <Puzzle className="h-4 w-4 shrink-0" />
              <span className="flex-1">Skill saved successfully!</span>
              {savedSkillId && (
                <button
                  onClick={async () => {
                    const url = chrome.runtime.getURL(`home.html#/skills/detail?id=${savedSkillId}`)
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
                    if (tab?.id) {
                      await chrome.tabs.update(tab.id, { url })
                    } else {
                      await chrome.tabs.create({ url })
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-green-500/10"
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </button>
              )}
              <button
                onClick={() => setSkillSaved(false)}
                className="rounded-lg p-1 hover:bg-green-500/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {messages.length === 0 && !isLoading && (
            <div className="px-3 pb-2">
              <SuggestionChips onSelect={(skill) => {
                chrome.tabs.create({ url: chrome.runtime.getURL(`/home.html#/skills/detail?id=${skill.id}&source=marketplace`) })
              }} />
            </div>
          )}
          <ChatInput
            ref={chatInputRef}
            onSend={sendMessage}
            onStop={stopAgent}
            isLoading={isLoading}
            disabled={!selectedProvider}
            providers={providers}
            selectedProvider={selectedProvider}
            onSelectProvider={selectProvider}
            onSaveProvider={saveProvider}
            onDeleteProvider={deleteProvider}
          />
        </>
      )}
      {view === 'chatList' && (
        <ChatList
          conversations={conversations}
          activeConversationId={conversationId}
          onSelectChat={handleSelectChat}
          onDeleteChat={removeConversation}
        />
      )}
    </div>
  )
}
