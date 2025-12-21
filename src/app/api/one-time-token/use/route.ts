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
        { error: formatValidationError(validationResult.error) },
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

    // トークンを使用済みとしてマーク
    const { error } = await supabase
      .from('one_time_tokens')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('token', token)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error in use token API:', error instanceof Error ? error.message : 'Unknown error')
    }
    return NextResponse.json(
      { error: 'Failed to mark token as used' },
      { status: 500 }
    )
  }
}
