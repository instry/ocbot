import { useState, useEffect } from 'react'
import { fetchMarketplaceSkills, type MarketplaceSkill } from '@/lib/marketplace/api'

export function SuggestionChips({ onSelect }: { onSelect: (skill: MarketplaceSkill) => void }) {
  const [skills, setSkills] = useState<MarketplaceSkill[]>([])

  useEffect(() => {
    fetchMarketplaceSkills({ limit: 4 })
      .then(({ skills }) => {
        // Sort by clone_count descending to show most popular
        const sorted = [...skills].sort((a, b) => b.clone_count - a.clone_count)
        setSkills(sorted.slice(0, 4))
      })
      .catch(() => {})
  }, [])

  if (skills.length === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {skills.map((skill) => (
        <button
          key={skill.id}
          onClick={() => onSelect(skill)}
          className="cursor-pointer rounded-full border border-border/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {skill.name}
        </button>
      ))}
    </div>
  )
}
