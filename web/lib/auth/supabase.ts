import { createClient } from '@supabase/supabase-js'
import { chromeStorageAdapter } from './storage-adapter'

const supabaseUrl = __OCBOT_SUPABASE_URL__
const supabaseAnonKey = __OCBOT_SUPABASE_ANON_KEY__

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})
