import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tokenSchema, formatValidationError } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Zodによる入力検証
    const validationResult = tokenSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { valid: false, message: formatValidationError(validationResult.error) },
        { status: 400 }
      )
    }

    const { token } = validationResult.data

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

    // 토ークン検証（ログには出力しない）
    const { data, error } = await supabase
      .from('one_time_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (error || !data) {
      console.log('❌ Token not found:', token)
      return NextResponse.json(
        { valid: false, message: 'トークンが無効です' },
        { status: 404 }
      )
    }

    // 이미 사용됨
    if (data.is_used) {
      console.log('⚠️ Token already used:', token)
      return NextResponse.json(
        { valid: false, message: 'このリンクは既に使用されました' },
        { status: 403 }
      )
    }

    // 만료됨
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      console.log('⚠️ Token expired:', token)
      return NextResponse.json(
        { valid: false, message: 'このリンクは期限切れです（7日間経過）' },
        { status: 403 }
      )
    }

    // 유효함
    console.log('✅ Token valid:', token)
    return NextResponse.json({
      valid: true,
      scheduleId: data.schedule_id
    })
  } catch (error: unknown) {
    console.error('Error in verify token API:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'Failed to verify token' },
      { status: 500 }
    )
  }
}
