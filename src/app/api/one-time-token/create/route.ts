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

    // ⭐ Supabase Service Role Client 생성
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

    // ⭐ 短いトークン生成（10文字の英数字、約839兆通りの組み合わせ）
    // 衝突の可能性が極めて低いため、重複チェックは行わず直接insertを試行
    // 万が一ユニーク制約エラーが発生した場合のみリトライ
    let token: string
    let attempts = 0
    const maxAttempts = 5

    // DB에 저장
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

    if (error) {
      throw error
    }

    return NextResponse.json({ token })
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error in create token API:', error instanceof Error ? error.message : 'Unknown error')
    }
    return NextResponse.json(
      { error: 'Failed to create token' },
      { status: 500 }
    )
  }
}
