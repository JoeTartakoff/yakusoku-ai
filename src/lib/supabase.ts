import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// 実行時にのみチェック（ビルド時にはエラーを発生させない）
if (typeof window === 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  // サーバーサイドでのみチェック（ビルド時を除く）
  if (process.env.NODE_ENV !== 'production' || process.env.VERCEL) {
    console.warn('Supabase URL and Anon Key must be provided')
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)
