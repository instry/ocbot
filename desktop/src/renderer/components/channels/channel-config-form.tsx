import { Input } from '@/components/ui/input'
import type { ChannelPlatform, ChannelConfig } from '@/types/channel'
import { cn } from '@/lib/utils'

interface ChannelConfigFormProps {
  platform: ChannelPlatform
  config: ChannelConfig | undefined
  onChange: (config: ChannelConfig) => void
  className?: string
}

const PLATFORM_FIELDS: Record<ChannelPlatform, Array<{ key: keyof ChannelConfig; label: string; type?: string }>> = {
  feishu: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password' },
    { key: 'domain', label: 'Domain' },
  ],
  dingtalk: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password' },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
  ],
  discord: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
  ],
  slack: [
    { key: 'botToken', label: 'Bot Token', type: 'password' },
  ],
  whatsapp: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password' },
  ],
  qq: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password' },
  ],
  wecom: [
    { key: 'botId', label: 'Bot ID' },
    { key: 'secret', label: 'Secret', type: 'password' },
  ],
  weixin: [
    { key: 'accountId', label: 'Account ID' },
  ],
}

export function ChannelConfigForm({ platform, config, onChange, className }: ChannelConfigFormProps) {
  const fields = PLATFORM_FIELDS[platform]

  const defaultConfig: ChannelConfig = {
    enabled: false,
    dmPolicy: 'open',
    groupPolicy: 'open',
  }

  const currentConfig = config || defaultConfig

  const handleChange = (key: keyof ChannelConfig, value: string | boolean) => {
    onChange({ ...currentConfig, [key]: value })
  }

  return (
    <div className={cn('space-y-4', className)}>
      {fields.map((field) => (
        <div key={field.key}>
          <label className="text-xs text-muted-foreground mb-1.5 block">{field.label}</label>
          <Input
            type={field.type || 'text'}
            value={(currentConfig[field.key] as string) || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label}`}
          />
        </div>
      ))}
    </div>
  )
}
