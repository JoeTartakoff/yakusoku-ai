import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { createErrorResponse } from '@/utils/errors'
import { updateMemberSchema, formatValidationError } from '@/lib/validation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

export async function POST(request: Request) {
  try {
    // 認証チェック
    const authResult = await requireAuth()
    if (!authResult) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Zodによる入力検証
    const validationResult = updateMemberSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: formatValidationError(validationResult.error) },
        { status: 400 }
      )
    }

    const { membershipId, userId } = validationResult.data

    // チームメンバーシップの所有者を確認
    const { data: membership } = await supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('id', membershipId)
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'Membership not found' },
        { status: 404 }
      )
    }

    // チームの所有者か確認
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('user_id')
      .eq('id', membership.team_id)
      .single()

    if (!team || team.user_id !== authResult.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .update({ user_id: userId })
      .eq('id', membershipId)
      .select()

    if (error) {
      console.error('❌ API Error:', error)
      throw error
    }

    console.log('✅ API: Updated successfully:', data)

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('❌ API Exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
