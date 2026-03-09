import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Search, ChevronLeft, ChevronRight, BadgeCheck, GitFork, Loader2 } from 'lucide-react'
import { getSkillAbbr, getLocalSkills, getLocalSkillDetail, getMarketplaceSkillDetail, deleteLocalSkill, getMarketplaceSkills, type Skill } from '../data/skills'
import { SkillDetailPage } from './SkillDetailPage'
import { SkillEditPage } from './SkillEditPage'

const CATEGORIES = [
  'All',
  'Search',
  'E-Commerce',
  'Financial',
  'News',
  'Real Estate',
  'Social Media',
  'Travel',
  'Marketplace',
  'Lead Generation',
  'SEO',
  'Jobs',
  'Developer',
  'Media',
  'Automation',
  'Integration',
  'Other',
]

function SkillIcon({ skill, className = "h-10 w-10" }: { skill: Skill, className?: string }) {
  if (skill.iconUrl) {
    return (
      <img
        src={skill.iconUrl}
        alt={skill.name}
        className={`${className} rounded-xl object-cover`}
      />
    )
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl bg-primary/20 text-sm font-semibold text-primary ${className}`}>
      {getSkillAbbr(skill.name)}
    </div>
  )
}

function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  const isCreating = skill.creating
  return (
    <div
      onClick={isCreating ? undefined : onClick}
      className={`flex flex-col rounded-xl border border-border/40 bg-card p-4 shadow-sm transition-all ${
        isCreating ? 'opacity-70' : 'cursor-pointer hover:bg-accent/50 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-4">
        <SkillIcon skill={skill} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-foreground">{skill.name}</span>
            {isCreating && (
              <span className="flex shrink-0 items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Creating…
              </span>
            )}
            {skill.official && (
              <span className="flex shrink-0 items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-500">
                <BadgeCheck className="h-3 w-3" />
                Official
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {skill.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
        {isCreating ? 'AI is generating skill metadata…' : skill.description}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-3 text-xs text-muted-foreground/80">
        <span className="font-mono">{skill.version}</span>
        {skill.installs > 0 ? (
          <span className="flex items-center gap-1.5">
            <GitFork className="h-3.5 w-3.5" />
            {skill.installs.toLocaleString()} clones
          </span>
        ) : (
          <span>Recently Added</span>
        )}
      </div>
    </div>
  )
}

const PAGE_SIZE = 30

export function SkillsPage() {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [page, setPage] = useState(1)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'marketplace' | 'my-skills'>('my-skills')

  const [mySkills, setMySkills] = useState<Skill[]>([])

  // Marketplace state
  const [marketplaceSkills, setMarketplaceSkills] = useState<Skill[]>([])
  const [marketplaceTotal, setMarketplaceTotal] = useState(0)
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getLocalSkills().then(setMySkills)
  }, [])

  // Auto-refresh when skills storage changes (e.g. skill created from sidepanel)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ocbot_skills) {
        getLocalSkills().then(setMySkills)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  // Auto-open skill detail if URL has /detail?id= or legacy ?id= parameter
  useEffect(() => {
    const hash = window.location.hash // e.g. #/skills/detail?id=xxx or #/skills?id=xxx
    const match = hash.match(/[?&]id=([^&]+)/)
    if (match) {
      const skillId = decodeURIComponent(match[1])
      const isMarketplace = hash.includes('source=marketplace')
      if (isMarketplace) {
        setActiveTab('marketplace')
        getMarketplaceSkillDetail(skillId).then((detail) => {
          if (detail) {
            setSelectedSkill(detail)
            history.replaceState(null, '', `#/skills/detail?id=${skillId}&source=marketplace`)
          }
        })
      } else {
        setActiveTab('my-skills')
        getLocalSkillDetail(skillId).then((detail) => {
          if (detail) {
            setSelectedSkill(detail)
            history.replaceState(null, '', `#/skills/detail?id=${skillId}`)
          }
        })
      }
    }
  }, [])

  // Fetch marketplace skills from server when tab/category/query/page changes
  useEffect(() => {
    if (activeTab !== 'marketplace') return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setMarketplaceLoading(true)
      const offset = (page - 1) * PAGE_SIZE
      getMarketplaceSkills(selectedCategory, query, offset, PAGE_SIZE)
        .then(({ skills, total }) => {
          setMarketplaceSkills(skills)
          setMarketplaceTotal(total)
        })
        .catch(() => {
          setMarketplaceSkills([])
          setMarketplaceTotal(0)
        })
        .finally(() => setMarketplaceLoading(false))
    }, query ? 300 : 0) // debounce search input, instant for category/page

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeTab, selectedCategory, query, page])

  const refreshMySkills = useCallback(() => {
    getLocalSkills().then(setMySkills)
  }, [])

  const handleDeleteSkill = useCallback(async (id: string) => {
    await deleteLocalSkill(id)
    refreshMySkills()
  }, [refreshMySkills])

  const handleRunSkill = useCallback(async (skill: Skill) => {
    await chrome.storage.local.set({ ocbot_run_skill: skill.id })
    const { id: windowId } = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: windowId! })
  }, [])

  // For my-skills tab: local filtering
  const filteredMySkills = useMemo(() => {
    let skills = mySkills
    if (query.trim()) {
      const q = query.toLowerCase()
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
    }
    return skills
  }, [query, mySkills])

  // Determine which skills to display
  const displaySkills = activeTab === 'my-skills' ? filteredMySkills : marketplaceSkills
  const totalForPagination = activeTab === 'my-skills' ? filteredMySkills.length : marketplaceTotal
  const totalPages = Math.max(1, Math.ceil(totalForPagination / PAGE_SIZE))
  const paged = activeTab === 'my-skills'
    ? filteredMySkills.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : marketplaceSkills // already server-paginated

  // Reset page when switching tabs or changing filters
  const handleTabChange = useCallback((tab: 'marketplace' | 'my-skills') => {
    setActiveTab(tab)
    setPage(1)
  }, [])

  const handleCategoryChange = useCallback((cat: string) => {
    setSelectedCategory(cat)
    setPage(1)
  }, [])

  if (editingSkillId) {
    return (
      <SkillEditPage
        skillId={editingSkillId}
        onBack={() => { setEditingSkillId(null); refreshMySkills() }}
        onDeleted={refreshMySkills}
      />
    )
  }

  if (selectedSkill) {
    return (
      <SkillDetailPage
        skill={selectedSkill}
        onBack={() => { setSelectedSkill(null); history.replaceState(null, '', '#/skills') }}
        backLabel={activeTab === 'my-skills' ? 'Back to My Skills' : 'Back to Marketplace'}
        onRun={handleRunSkill}
        onDelete={activeTab === 'my-skills' ? handleDeleteSkill : undefined}
        onEdit={activeTab === 'my-skills' ? (id) => { setSelectedSkill(null); setEditingSkillId(id) } : undefined}
        onCloned={activeTab === 'marketplace' ? () => { refreshMySkills() } : undefined}
      />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Skills
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover and clone skills. Complete a task in chat to save it as a skill.
        </p>
      </div>

      {/* Tab toggle */}
      <div className="mt-4 flex items-center gap-4 border-b border-border/40">
        <button
          onClick={() => handleTabChange('my-skills')}
          className={`cursor-pointer pb-2 text-sm transition-colors ${
            activeTab === 'my-skills'
              ? 'border-b-2 border-primary font-semibold text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          My Skills ({mySkills.length})
        </button>
        <button
          onClick={() => handleTabChange('marketplace')}
          className={`cursor-pointer pb-2 text-sm transition-colors ${
            activeTab === 'marketplace'
              ? 'border-b-2 border-primary font-semibold text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Marketplace{marketplaceTotal > 0 ? ` (${marketplaceTotal})` : ''}
        </button>
      </div>

      {(activeTab === 'marketplace' || mySkills.length > 0) && (
        <div className="relative mt-4 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search skills..."
            className="w-full rounded-xl border border-border/50 bg-muted/50 py-2.5 pl-9 pr-4 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary"
          />
        </div>
      )}

      {activeTab === 'marketplace' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
                selectedCategory === cat
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'marketplace' && marketplaceLoading ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p>Loading marketplace skills…</p>
        </div>
      ) : activeTab === 'my-skills' && filteredMySkills.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <p>No skills yet. Complete a task in the sidepanel, then save it as a Skill.</p>
          <button
            onClick={() => handleTabChange('marketplace')}
            className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Browse Marketplace
          </button>
        </div>
      ) : activeTab === 'marketplace' && displaySkills.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <p>No skills found. Try a different search or category.</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {paged.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onClick={() => {
                setSelectedSkill(skill)
                history.replaceState(null, '', `#/skills/detail?id=${skill.id}`)
              }} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center gap-2 pb-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`min-w-[36px] cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      n === page
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {activeTab === 'marketplace'
                  ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, marketplaceTotal)} of ${marketplaceTotal} skills`
                  : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredMySkills.length)} of ${filteredMySkills.length} skills`
                }
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
