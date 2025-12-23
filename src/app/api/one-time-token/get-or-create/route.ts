import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scheduleIdSchema, formatValidationError } from '@/lib/validation'
import { generateShortToken } from '@/utils/token-generator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Zodによる入力検証
    const validationResult = scheduleIdSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: formatValidationError(validationResult.error) },
        { status: 400 }
      )
    }

    const { scheduleId } = validationResult.data

    // ⭐ Supabase Service Role Client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 既存の未使用トークンを取得
    const { data: existingToken, error: selectError } = await supabase
      .from('one_time_tokens')
      .select('token, expires_at')
      .eq('schedule_id', scheduleId)
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116は「結果が見つからない」エラーなので無視
      throw selectError
    }

    // 既存のトークンがある場合
    if (existingToken) {
      const now = new Date()
      const expiresAt = new Date(existingToken.expires_at)
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      // 有効期限が7日未満なら更新
      if (expiresAt < sevenDaysFromNow) {
        const { error: updateError } = await supabase
          .from('one_time_tokens')
          .update({
            expires_at: sevenDaysFromNow.toISOString()
          })
          .eq('token', existingToken.token)

        if (updateError) {
          throw updateError
        }
      }

      return NextResponse.json({ token: existingToken.token })
    }

    // 既存のトークンがない場合、新規作成
    let token: string
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts) {
      token = generateShortToken()
      attempts++

      const { data, error } = await supabase
        .from('one_time_tokens')
        .insert({
          token,
          schedule_id: scheduleId,
          is_used: false,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (!error) {
        return NextResponse.json({ token })
      }

      // ユニーク制約違反の場合のみリトライ（PostgreSQLエラーコード: 23505）
      if (error.code !== '23505') {
        throw error
      }

      // 最後の試行でも失敗した場合
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique token after multiple attempts')
      }
    }

    throw new Error('Failed to generate token')
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error in get-or-create token API:', error instanceof Error ? error.message : 'Unknown error')
    }
    return NextResponse.json(
      { error: 'Failed to get or create token' },
      { status: 500 }
    )
  }
}

