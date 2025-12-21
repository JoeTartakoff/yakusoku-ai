import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/auth'
import { createErrorResponse } from '@/utils/errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
)

export async function GET(request: Request) {
  // 本番環境では無効化
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    )
  }

  // 開発環境では管理者認証が必要
  if (!checkAdminAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  try {
    console.log('=== TEST CALENDAR API ===')
    
    // 모든 토큰 조회
    const { data: allTokens, error: allError } = await supabaseAdmin
      .from('user_tokens')
      .select('*')

    if (allError) {
      return NextResponse.json({ error: 'Failed to fetch tokens', details: allError })
    }

    console.log('📊 Total tokens in database:', allTokens?.length || 0)

    if (!allTokens || allTokens.length === 0) {
      return NextResponse.json({ 
        error: 'No tokens found in database',
        message: 'Please log in first to save tokens'
      })
    }

    // 最初のトークンでテスト（ユーザーIDはログに出力しない）
    const tokens = allTokens[0]

    // 간단한 Calendar API 테스트
    const testUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=5'
    
    const response = await fetch(testUrl, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    const data = await response.json()

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      tokenExpiresAt: tokens.expires_at,
      tokenExpired: new Date(tokens.expires_at) < new Date(),
      eventsCount: data.items?.length || 0,
      hasError: !!data.error,
      error: data.error,
      sampleEvent: data.items?.[0],
      allTokensCount: allTokens.length,
      // ユーザーIDはレスポンスに含めない（機密情報）
      allTokensInfo: allTokens.map(t => ({
        expires_at: t.expires_at,
        expired: new Date(t.expires_at) < new Date(),
      })),
    })
  } catch (error: unknown) {
    return createErrorResponse(error, 500)
  }
}