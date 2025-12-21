import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * サーバーサイドでSupabaseクライアントを作成
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

/**
 * 認証が必要なAPIルートで使用する認証チェック関数
 * @returns 認証されたユーザー情報、またはnull（認証失敗時）
 */
export async function requireAuth(): Promise<{ user: any; supabase: any } | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return { user, supabase }
}

/**
 * 管理者認証チェック（リクエストヘッダーから）
 */
export function checkAdminAuth(request: Request): boolean {
  // 本番環境では常にfalseを返す
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  const adminToken = process.env.ADMIN_AUTH_TOKEN
  if (!adminToken) {
    return false
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${adminToken}`
}

/**
 * スケジュールの所有者かチームメンバーかをチェック
 */
export async function checkScheduleAccess(
  scheduleId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  
  // スケジュールを取得
  const { data: schedule, error } = await supabase
    .from('schedules')
    .select('user_id, team_id')
    .eq('id', scheduleId)
    .single()

  if (error || !schedule) {
    return false
  }

  // 所有者の場合
  if (schedule.user_id === userId) {
    return true
  }

  // チームメンバーの場合
  if (schedule.team_id) {
    const { data: member } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', schedule.team_id)
      .eq('user_id', userId)
      .single()

    return !!member
  }

  return false
}
