import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import { requireAuth, checkScheduleAccess } from '@/lib/auth'
import { createErrorResponse } from '@/utils/errors'
import { guestPresetsSchema, formatValidationError } from '@/lib/validation'

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
    const validationResult = guestPresetsSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: formatValidationError(validationResult.error) },
        { status: 400 }
      )
    }

    const { scheduleId, guests } = validationResult.data

    // スケジュールへのアクセス権限を確認
    const hasAccess = await checkScheduleAccess(scheduleId, authResult.user.id)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const guestPresets = guests.map((guest) => ({
      schedule_id: scheduleId,
      guest_name: guest.name,
      guest_email: guest.email,
      custom_token: nanoid(10),
    }))

    const { data, error } = await supabaseAdmin
      .from('guest_presets')
      .insert(guestPresets)
      .select()

    if (error) throw error

    return NextResponse.json({ 
      success: true,
      guests: data 
    })
  } catch (error: unknown) {
    return createErrorResponse(error, 500)
  }
}
