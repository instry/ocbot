const LOGO_URL = '/icon/icon32.png'

export function BotAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-14 w-14',
  }
  const imgClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-9 w-9',
  }

  return (
    <div className={`${sizeClasses[size]} shrink-0 flex items-center justify-center`}>
      <img src={LOGO_URL} alt="ocbot" className={imgClasses[size]} />
    </div>
  )
}
