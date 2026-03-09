import { useState, useEffect } from 'react'
import { fetchMarketplaceSkills, type MarketplaceSkillSummary } from '@/lib/marketplace/api'

export function SuggestionChips({ onSelect }: { onSelect: (skill: MarketplaceSkillSummary) => void }) {
  const [skills, setSkills] = useState<MarketplaceSkillSummary[]>([])

  useEffect(() => {
    fetchMarketplaceSkills({ limit: 4 })
      .then(({ skills }) => {
        setSkills(skills.slice(0, 4))
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
