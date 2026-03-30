import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AppLocale = 'en' | 'zh-CN'
export type AppLocalePreference = 'system' | AppLocale

const LOCALE_PREFERENCE_STORAGE_KEY = 'ocbot-locale-preference'

type TranslateParams = Record<string, string | number>

type I18nContextValue = {
  locale: AppLocale
  preference: AppLocalePreference
  setPreference: (preference: AppLocalePreference) => void
  t: (text: string, params?: TranslateParams) => string
}

const zhCNTranslations: Record<string, string> = {
  'Connecting to Ocbot...': '正在连接...',
  'Starting AI runtime': '正在启动...',
  'Preparing first-time setup...': '正在准备首次设置...',
  'Reconnecting AI runtime…': '正在重新连接…',
  Chat: '聊天',
  Skills: '技能',
  Cron: '定时任务',
  Models: '模型',
  Mobile: '移动端',
  Settings: '设置',
  Sessions: '会话',
  'New Chat': '新建对话',
  'Search...': '搜索...',
  'No sessions found': '未找到会话',
  'No sessions yet': '暂无会话',
  General: '通用',
  Browser: '浏览器',
  Updates: '更新',
  About: '关于',
  System: '系统',
  Custom: '自定义',
  Light: '浅色',
  Dark: '深色',
  Off: '关闭',
  On: '开启',
  'Failed to load browser settings.': '加载浏览器设置失败。',
  'Failed to save browser settings.': '保存浏览器设置失败。',
  'Failed to load startup settings.': '加载开机启动设置失败。',
  'Failed to save startup settings.': '保存开机启动设置失败。',
  'Color Scheme': '配色方案',
  'Launch at Login': '登录时启动',
  Language: '语言',
  'Follow System': '跟随系统',
  English: 'English',
  中文: '中文',
  'Packaged app only.': '仅打包后的应用支持。',
  'Saving…': '正在保存…',
  Saved: '已保存',
  'Choose which browser the agent uses for web tasks and attached sessions.': '选择代理执行网页任务和附加会话时使用的浏览器。',
  Profile: '配置文件',
  'Attach to an existing Chromium profile with saved logins and cookies.': '连接到已有的 Chromium 配置文件，复用已保存的登录态和 Cookie。',
  'Auto-detect': '自动检测',
  'No local Chromium profiles were detected. The agent will use the system browser without attaching to a saved profile.': '未检测到本地 Chromium 配置文件。代理将使用系统浏览器，但不会附加到已保存的配置文件。',
  Refresh: '刷新',
  Cancel: '取消',
  Save: '保存',
  'Saving...': '正在保存...',
  'Pending release': '待发布',
  'Unknown size': '大小未知',
  'No update information is available yet.': '暂时没有可用的更新信息。',
  'You are already on the latest version.': '你已经是最新版本。',
  'Failed to check for updates.': '检查更新失败。',
  'Failed to download update.': '下载更新失败。',
  'Failed to install update.': '安装更新失败。',
  'Clear All Local Data': '清空所有本地数据',
  'Remove saved credentials, logs, themes, and preferences on this device, then restart Ocbot.': '删除这台设备上的已保存凭证、日志、主题和偏好设置，然后重启 Ocbot。',
  'Clear all local data and restart Ocbot? This removes saved credentials, logs, themes, and preferences on this device.': '确定要清空所有本地数据并重启 Ocbot 吗？这会删除这台设备上的已保存凭证、日志、主题和偏好设置。',
  'Failed to reset local data.': '重置本地数据失败。',
  'Resetting...': '正在重置...',
  'Restarting Ocbot...': '正在重启 Ocbot...',
  'Checking for updates...': '正在检查更新...',
  'Version {{version}} is ready to install.': '版本 {{version}} 已可安装。',
  'Version {{version}} is available.': '版本 {{version}} 可用。',
  'You are on the latest version.': '当前已是最新版本。',
  'No update information available yet.': '暂时没有更新信息。',
  'Check, download, and install the latest version.': '检查、下载并安装最新版本。',
  'Released {{date}}': '发布于 {{date}}',
  'Downloading update': '正在下载更新',
  'Preparing...': '准备中...',
  'Release notes': '更新说明',
  'Check again': '重新检查',
  'Cancel download': '取消下载',
  'Installing...': '正在安装...',
  'Install update': '安装更新',
  'View release': '查看发布说明',
  'What are you exactly?': '你到底是什么？',
  "I'm a new species! Part browser, part AI agent. Think of me as a very helpful octopus that lives in your browser tabs.": '我是一个新品种！一半是浏览器，一半是 AI 代理。你可以把我当作住在浏览器标签页里的超能小章鱼。',
  'Why the name "ocbot"?': '为什么叫 “ocbot”？',
  [`Because "octo" means 8! I'm an octopus-inspired bot with eight arms ready to multitask across the web.`]: '因为 “octo” 代表 8！我是一个受章鱼启发的机器人，有八只手臂，随时可以在网上多线程处理任务。',
  'Why purple?': '为什么是紫色？',
  "Because I'm hitting the big time — only royalty gets to be purple. Plus it's the color of a certain deep-sea creature.": '因为我要做大做强——紫色可是王者专属。而且它也是某种深海生物的颜色。',
  'Will you leak my data?': '你会泄露我的数据吗？',
  "Nope! All your data is stored locally. I don't phone home. Your conversations, your settings — all yours.": '不会！你的所有数据都保存在本地。我不会偷偷上传。你的对话、你的设置——都只属于你。',
  'Got brains, got arms, up before the alarm.': '有脑力，也有手臂，闹钟还没响我就先开工。',
  [`My name is ocbot. I'm super smart and super quick at getting things done.
            I live inside your browser with eight nimble arms ready to handle any task.
            Ask me to find info, fill forms, compare products, or automate your online work.
            I don't sleep, I don't forget, and I'm always ready.`]: '我叫 ocbot。我很聪明，也很擅长迅速把事情做完。\n我住在你的浏览器里，带着八只灵活的手臂，随时准备处理各种任务。\n你可以让我帮你查资料、填表单、比价，或者自动化处理在线工作。\n我不睡觉，不会忘事，而且永远待命。',
  FAQ: '常见问题',
  'Back to Models': '返回模型列表',
  'Set Up Your First Provider': '设置你的第一个提供商',
  'Add Provider': '添加提供商',
  'Add one model provider to finish setup and unlock chat.': '添加一个模型提供商以完成设置并解锁聊天功能。',
  Edit: '编辑',
  'Manage your AI model providers and API keys.': '管理你的 AI 模型提供商和 API Key。',
  'Complete setup': '完成设置',
  'Add your first provider before using chat.': '在使用聊天前先添加你的第一个提供商。',
  'Loading...': '加载中...',
  'No providers configured yet. Add one to get started.': '尚未配置任何提供商。添加一个即可开始使用。',
  'Current default provider': '当前默认提供商',
  'Click to switch provider': '点击切换提供商',
  '★ Default': '★ 默认',
  Add: '添加',
  Delete: '删除',
  Region: '区域',
  'API Key': 'API Key',
  'Get key': '获取密钥',
  'Stored API key': '已保存的 API Key',
  'Enter API key': '输入 API Key',
  'Base URL': '基础 URL',
  Model: '模型',
  'API key is required': '必须填写 API Key',
  'No AI provider is configured yet. Open Models and add your first provider to finish setup.': '尚未配置 AI 提供商。请打开“模型”并添加第一个提供商以完成设置。',
  'Open Models': '打开模型',
  'Add a provider in Models to start chatting...': '先在“模型”中添加提供商后即可开始聊天...',
  'Send a message...': '发送消息...',
  'Generating...': '生成中...',
  'How can I help?': '我可以帮你做什么？',
  'Search models...': '搜索模型...',
  'Add model': '添加模型',
  'No models configured': '尚未配置模型',
  'Add a model': '添加模型',
  'No models found': '未找到模型',
  'Connecting{{attemptSuffix}}...': '连接中{{attemptSuffix}}...',
  ' (attempt {{attempt}})': '（第 {{attempt}} 次尝试）',
  Disconnected: '已断开连接',
  'Connect your agent to messaging platforms. Select a channel to configure.': '将你的代理连接到消息平台。选择一个频道进行配置。',
  'Coming soon': '即将推出',
  '{{channel}} setup is not available yet in the desktop app.': '桌面应用暂不支持配置 {{channel}}。',
  'No status available': '暂无状态',
  Status: '状态',
  Connected: '已连接',
  'Bot: ': '机器人：',
  'Started: ': '启动时间：',
  'Scan to Connect': '扫码连接',
  'Reconnect with WeChat': '重新连接微信',
  'WeChat is connected': '微信已连接',
  'Generating QR code...': '正在生成二维码...',
  'Expires in {{seconds}}s': '{{seconds}} 秒后过期',
  'This QR code has expired.': '此二维码已过期。',
  'Scan with WeChat': '使用微信扫码',
  'How to connect:': '连接方法：',
  'Click "Scan to Connect" to generate a QR code': '点击“扫码连接”生成二维码',
  'Open WeChat on your phone and scan the code': '打开手机微信并扫描二维码',
  'Confirm the login on your phone': '在手机上确认登录',
  'This build does not include a ready WeChat runtime': '当前构建未包含可用的微信运行时',
  'Scan to Recreate Credentials': '扫码重新生成凭证',
  'Scan to Create Credentials': '扫码生成凭证',
  'Scan with Feishu': '使用飞书扫码',
  'Feishu is connected': '飞书已连接',
  'OR Manual configuration': '或手动配置',
  Domain: '域名',
  'Feishu (China)': '飞书（中国）',
  'Lark (Global)': 'Lark（全球）',
  'App ID': 'App ID',
  'Enter App ID': '输入 App ID',
  'App Secret': 'App Secret',
  'Enter App Secret': '输入 App Secret',
  'Feishu senders are approved automatically.': '飞书发送方会自动通过审核。',
  'Ocbot desktop bridge not available': 'Ocbot 桌面桥接不可用',
  'Authorization QR expired. Generate a new code to continue.': '授权二维码已过期，请重新生成后继续。',
  'Failed to verify Feishu credentials': '验证飞书凭证失败',
  'Feishu authorization completed.': '飞书授权已完成。',
  'Name': '名称',
  'Source': '来源',
  'Downloads': '下载量',
  'Stars': '星标数',
  'Newest': '最新',
  'Recently Updated': '最近更新',
  Featured: '精选',
  Official: '官方',
  Deprecated: '已弃用',
  Install: '安装',
  Installed: '已安装',
  Failed: '失败',
  'My Skills': '我的技能',
  Marketplace: '市场',
  'Browse and manage your AI skills': '浏览并管理你的 AI 技能',
  'Search skills...': '搜索技能...',
  'Search marketplace...': '搜索市场...',
  Sort: '排序',
  'Refreshing...': '刷新中...',
  Cards: '卡片',
  List: '列表',
  'No matching skills': '没有匹配的技能',
  'Browse Marketplace': '浏览市场',
  'Loading more...': '正在加载更多...',
  'Loading marketplace...': '正在加载市场...',
  Retry: '重试',
  'Searching...': '搜索中...',
  'No results found': '未找到结果',
  'No skills available': '暂无可用技能',
  'Load more': '加载更多',
  'No description': '暂无描述',
  Disabled: '已禁用',
  Blocked: '已阻止',
  Active: '已启用',
  'Missing deps': '缺少依赖',
  Inactive: '未启用',
  bundled: '内置',
  Uninstall: '卸载',
  'Uninstalling...': '正在卸载...',
  '✓ Installed': '✓ 已安装',
  'Back to My Skills': '返回我的技能',
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  preference: 'system',
  setPreference: () => {},
  t: (text, params) => interpolate(text, params),
})

let currentLocale: AppLocale = 'en'

function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text

  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    text,
  )
}

export function normalizeSystemLocale(locale?: string | null): AppLocale {
  const normalized = (locale ?? '').trim().toLowerCase()
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN'
  }
  return 'en'
}

export function getCurrentLocale(): AppLocale {
  return currentLocale
}

export function translateText(text: string, locale: AppLocale = currentLocale, params?: TranslateParams): string {
  const resolved = locale === 'zh-CN'
    ? (zhCNTranslations[text] ?? text)
    : text

  return interpolate(resolved, params)
}

function setCurrentLocale(locale: AppLocale) {
  currentLocale = locale
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en'
}

function readStoredPreference(): AppLocalePreference {
  try {
    const stored = window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)
    if (stored === 'en' || stored === 'zh-CN' || stored === 'system') {
      return stored
    }
  } catch {}

  return 'system'
}

function writeStoredPreference(preference: AppLocalePreference) {
  try {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, preference)
  } catch {}
}

async function resolveInitialLocale(preference: AppLocalePreference): Promise<AppLocale> {
  if (preference !== 'system') {
    return preference
  }

  try {
    return normalizeSystemLocale(await window.ocbot?.getSystemLocale?.())
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppLocalePreference>('system')
  const [locale, setLocale] = useState<AppLocale>('en')

  useEffect(() => {
    let cancelled = false
    const nextPreference = readStoredPreference()
    setPreferenceState(nextPreference)

    void resolveInitialLocale(nextPreference).then((resolvedLocale) => {
      if (cancelled) return
      setCurrentLocale(resolvedLocale)
      setLocale(resolvedLocale)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const setPreference = (nextPreference: AppLocalePreference) => {
    writeStoredPreference(nextPreference)
    setPreferenceState(nextPreference)

    if (nextPreference === 'system') {
      void resolveInitialLocale('system').then((resolvedLocale) => {
        setCurrentLocale(resolvedLocale)
        setLocale(resolvedLocale)
      })
      return
    }

    setCurrentLocale(nextPreference)
    setLocale(nextPreference)
  }

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    preference,
    setPreference,
    t: (text, params) => translateText(text, locale, params),
  }), [locale, preference])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
