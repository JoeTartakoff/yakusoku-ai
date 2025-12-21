import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto' 
import { sendBookingNotifications } from '@/lib/sendgrid'
import { bookingSchema, formatValidationError } from '@/lib/validation'
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      if (process.env.NODE_ENV !== 'production') {
        const errorData = await response.json()
        console.error('Token refresh failed:', errorData)
      }
      return null
    }

    const data = await response.json()
    return data.access_token || null
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error refreshing token:', error)
    }
    return null
  }
}

async function addCalendarEvent(
  accessToken: string,
  eventData: Record<string, unknown>,
  conferenceDataVersion: number = 0
): Promise<Record<string, unknown>> {
  const url = conferenceDataVersion > 0
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=${conferenceDataVersion}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  })

    if (!response.ok) {
      if (process.env.NODE_ENV !== 'production') {
        const errorData = await response.json()
        console.error('Calendar API error:', errorData)
      }
      throw new Error('Failed to create calendar event')
    }

    const result = await response.json()
    return result
}

async function checkTeamMemberAvailability(
  userId: string,
  bookingDate: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  try {
    // ユーザーIDをログに出力しない（機密情報）
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (tokenError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Token query error:', tokenError)
      }
      return false
    }

    if (!tokens) {
      return false
    }

    let accessToken = tokens.access_token
    const expiresAt = new Date(tokens.expires_at)
    const now = new Date()
    
    if (expiresAt < now) {
      const newToken = await refreshAccessToken(tokens.refresh_token)
      if (!newToken) {
        return false
      }
      accessToken = newToken
    }

    const [startHour, startMin] = startTime.split(':')
    const [endHour, endMin] = endTime.split(':')
    const timeMin = `${bookingDate}T${startHour.padStart(2, '0')}:${startMin.padStart(2, '0')}:00+09:00`
    const timeMax = `${bookingDate}T${endHour.padStart(2, '0')}:${endMin.padStart(2, '0')}:00+09:00`

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `singleEvents=true`

    const response = await fetch(calendarUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      if (process.env.NODE_ENV !== 'production') {
        const errorText = await response.text()
        console.error('Calendar API error:', errorText)
      }
      return false
    }

    const data = await response.json()
    const hasConflict = data.items && data.items.length > 0
    
    return !hasConflict

  } catch (error) {
    console.error(`❌ Exception in checkTeamMemberAvailability:`, error)
    return false
  }
}

async function assignTeamMemberRoundRobin(
  scheduleId: string,
  teamId: string,
  bookingDate: string,
  startTime: string,
  endTime: string
): Promise<string | null> {
  try {
    console.log('🔄 === ROUND ROBIN ASSIGNMENT START ===')
    console.log(`📋 Schedule ID: ${scheduleId}`)
    console.log(`👥 Team ID: ${teamId}`)
    
    const { data: members } = await supabaseAdmin
      .from('team_members')
      .select('user_id, email')
      .eq('team_id', teamId)
      .not('user_id', 'is', null)
      .order('joined_at', { ascending: true })

    if (!members || members.length === 0) {
      return null
    }

    // チームメンバー情報をログに出力しない（機密情報）

    const { data: rrState, error: rrStateError } = await supabaseAdmin
      .from('round_robin_state')
      .select('last_assigned_user_id')
      .eq('schedule_id', scheduleId)
      .maybeSingle()

    if (rrStateError && process.env.NODE_ENV !== 'production') {
      console.error('Error fetching RR state:', rrStateError)
    }

    let startIndex = 0
    if (rrState?.last_assigned_user_id) {
      const lastIndex = members.findIndex(m => m.user_id === rrState.last_assigned_user_id)
      if (lastIndex >= 0) {
        startIndex = (lastIndex + 1) % members.length
      }
    }

    for (let i = 0; i < members.length; i++) {
      const currentIndex = (startIndex + i) % members.length
      const currentMember = members[currentIndex]

      const isAvailable = await checkTeamMemberAvailability(
        currentMember.user_id!,
        bookingDate,
        startTime,
        endTime
      )

      if (isAvailable) {
        // メンバー情報をログに出力しない（機密情報）
        const { data: rrUpdate, error: rrError } = await supabaseAdmin
          .from('round_robin_state')
          .upsert({
            schedule_id: scheduleId,
            last_assigned_user_id: currentMember.user_id,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'schedule_id'
          })
          .select()

        if (rrError && process.env.NODE_ENV !== 'production') {
          console.error('Failed to update round_robin_state:', rrError)
        }
        return currentMember.user_id!
      } else {
        console.log(`   ❌ Not available, trying next member...`)
      }
    }

    // 利用可能なメンバーが見つからなかった
    return null

  } catch (error) {
    console.error('❌ Error in Round Robin assignment:', error)
    return null
  }
}

async function addEventToAllTeamMembers(
  teamId: string,
  assignedUserId: string,
  assignedUserEmail: string,
  eventData: Record<string, unknown>,
  scheduleTitle: string,
  conferenceDataVersion: number = 0
): Promise<string[]> {
  // チームメンバー情報をログに出力しない（機密情報）
  try {
    const { data: members } = await supabaseAdmin
      .from('team_members')
      .select('user_id, email')
      .eq('team_id', teamId)
      .not('user_id', 'is', null)

    if (!members || members.length === 0) {
      return []
    }
    
    const eventIds: string[] = []
    let successCount = 0
    let failCount = 0

    for (const member of members) {
      // メンバー情報をログに出力しない（機密情報）
      
      try {
        const { data: tokens, error: tokenError } = await supabaseAdmin
          .from('user_tokens')
          .select('*')
          .eq('user_id', member.user_id)
          .maybeSingle()

        if (tokenError || !tokens) {
          failCount++
          continue
        }

        let accessToken = tokens.access_token
        const expiresAt = new Date(tokens.expires_at)
        
        if (expiresAt < new Date()) {
          const newToken = await refreshAccessToken(tokens.refresh_token)
          if (!newToken) {
            failCount++
            continue
          }
          accessToken = newToken
          
          await supabaseAdmin
            .from('user_tokens')
            .update({
              access_token: newToken,
              expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', member.user_id)
        }

        const teamEventData = {
          ...eventData,
          summary: `[팀] ${scheduleTitle}`,
          description: `담당자: ${assignedUserEmail}\n\n${eventData.description || ''}`
        }

        const event = await addCalendarEvent(accessToken, teamEventData, conferenceDataVersion)
        const eventId = (event as { id: string }).id
        
        eventIds.push(eventId)
        successCount++
        
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to add event for team member:', error)
        }
        failCount++
      }
    }

    return eventIds

  } catch (error) {
    console.error('❌ Error in addEventToAllTeamMembers:', error)
    return []
  }
}

export async function POST(request: Request) {
  // レート制限チェック（1分間に10リクエストまで）
  const identifier = getRateLimitIdentifier(request)
  const rateLimit = checkRateLimit(identifier, 10, 60000)
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
      },
      { 
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': String(rateLimit.resetTime),
        }
      }
    )
  }

  try {
    const body = await request.json()

    // Zodによる入力検証
    const validationResult = bookingSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = formatValidationError(validationResult.error)
      console.error('❌ Validation error in add-event API:', {
        error: errorMessage,
        receivedData: {
          scheduleId: body.scheduleId ? 'present' : 'missing',
          bookingDate: body.bookingDate,
          startTime: body.startTime,
          endTime: body.endTime,
          guestName: body.guestName ? 'present' : 'missing',
          guestEmail: body.guestEmail ? 'present' : 'missing',
          guestUserId: body.guestUserId ? 'present' : 'missing',
          comment: body.comment ? 'present' : 'missing',
        },
      })
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 400 }
      )
    }

    const { scheduleId, bookingDate, startTime, endTime, guestName, guestEmail, guestUserId, comment } = validationResult.data

    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .select('title, user_id, team_id, assignment_method, create_meet_link')
      .eq('id', scheduleId)
      .single()

    if (scheduleError) {
      console.error('❌ Schedule error:', scheduleError)
      throw scheduleError
    }

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found' },
        { status: 404 }
      )
    }

    const [startHour, startMin] = startTime.split(':')
    const [endHour, endMin] = endTime.split(':')
    const startDateTime = `${bookingDate}T${startHour.padStart(2, '0')}:${startMin.padStart(2, '0')}:00`
    const endDateTime = `${bookingDate}T${endHour.padStart(2, '0')}:${endMin.padStart(2, '0')}:00`

    // XSS対策: HTMLエスケープ
    const escapeHtml = (text: string) => {
      const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }
      return text.replace(/[&<>"']/g, (m) => map[m])
    }

    const safeGuestName = escapeHtml(guestName)
    const safeGuestEmail = escapeHtml(guestEmail)
    const safeComment = comment ? escapeHtml(comment) : ''

    const hostEventData: Record<string, unknown> = {
      summary: `${schedule.title} - ${safeGuestName}`,
      description: `予約者: ${safeGuestName}\nメール: ${safeGuestEmail}${safeComment ? `\n\nコメント:\n${safeComment}` : ''}`,
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Tokyo',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Tokyo',
      },
      attendees: [{ email: guestEmail }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    }

    if (schedule.create_meet_link) {
      console.log('🎥 Adding Google Meet conference data...')
      hostEventData.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    }

    const conferenceDataVersion = schedule.create_meet_link ? 1 : 0

    let assignedUserId = schedule.user_id
    let assignedUserEmail = ''
    let hostEventIds: string[] = []
    
    if (schedule.team_id && schedule.assignment_method === 'round_robin') {
      const teamMemberId = await assignTeamMemberRoundRobin(
        scheduleId,
        schedule.team_id,
        bookingDate,
        startTime,
        endTime
      )

      if (!teamMemberId) {
        return NextResponse.json({ 
          success: false, 
          error: 'この時間帯に対応可能なチームメンバーがいません' 
        }, { status: 400 })
      }

      assignedUserId = teamMemberId
      
      const { data: assignedMember } = await supabaseAdmin
        .from('team_members')
        .select('email')
        .eq('user_id', assignedUserId)
        .single()
      
      assignedUserEmail = assignedMember?.email || ''
      hostEventIds = await addEventToAllTeamMembers(
        schedule.team_id,
        assignedUserId,
        assignedUserEmail,
        hostEventData,
        schedule.title,
        conferenceDataVersion
      )

      if (hostEventIds.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: 'チームメンバーのカレンダーへの追加に失敗しました' 
        }, { status: 500 })
      }
      
    } else {
      const { data: hostTokens, error: hostTokensError } = await supabaseAdmin
        .from('user_tokens')
        .select('*')
        .eq('user_id', assignedUserId)
        .maybeSingle()

      if (hostTokensError || !hostTokens) {
        return NextResponse.json({ 
          success: false, 
          error: 'ホストのトークンが見つかりません' 
        }, { status: 400 })
      }

      let hostAccessToken = hostTokens.access_token
      const hostExpiresAt = new Date(hostTokens.expires_at)
      
      if (hostExpiresAt < new Date()) {
        const newToken = await refreshAccessToken(hostTokens.refresh_token)
        if (!newToken) {
          throw new Error('Failed to refresh token')
        }
        hostAccessToken = newToken

        await supabaseAdmin
          .from('user_tokens')
          .update({
            access_token: newToken,
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', assignedUserId)
      }

      const hostEvent = await addCalendarEvent(hostAccessToken, hostEventData, conferenceDataVersion)
      hostEventIds = [(hostEvent as { id: string }).id]
    }

    let guestEventId: string | null = null
    
    const { data: targetBooking } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('schedule_id', scheduleId)
      .eq('booking_date', bookingDate)
      .eq('start_time', startTime)
      .eq('end_time', endTime)
      .eq('guest_email', guestEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (targetBooking) {
      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          host_calendar_event_id: hostEventIds[0],
          guest_calendar_event_id: guestEventId,
          assigned_user_id: assignedUserId,
        })
        .eq('id', targetBooking.id)

      if (updateError && process.env.NODE_ENV !== 'production') {
        console.error('Failed to update booking:', updateError)
      }
    }

    // メール送信
    let hostName = 'ホスト'
    let hostEmail = ''

    if (schedule.team_id) {
      hostEmail = assignedUserEmail
      hostName = assignedUserEmail?.split('@')[0] || 'ホスト'
    } else {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(assignedUserId)
        
        if (authData?.user?.email) {
          hostEmail = authData.user.email
          hostName = authData.user.user_metadata?.name || authData.user.email.split('@')[0]
        } else {
          hostEmail = 'gogumatruck@gmail.com'
          hostName = 'ホスト'
        }
      } catch (authError) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Error fetching auth user:', authError)
        }
        hostEmail = 'gogumatruck@gmail.com'
        hostName = 'ホスト'
      }
    }

    // Meet 링크 추출 (있는 경우)
    let meetLink: string | undefined = undefined
    if (schedule.create_meet_link && hostEventIds.length > 0) {
      try {
        const { data: hostTokens } = await supabaseAdmin
          .from('user_tokens')
          .select('access_token')
          .eq('user_id', assignedUserId)
          .single()

        if (hostTokens) {
          const eventResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${hostEventIds[0]}`,
            {
              headers: { 'Authorization': `Bearer ${hostTokens.access_token}` }
            }
          )

          if (eventResponse.ok) {
            const eventData = await eventResponse.json()
            meetLink = eventData.hangoutLink
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to extract Meet link:', error)
        }
      }
    }

    // メール送信
    console.log('📧 Starting email notification process...')
    console.log('📧 Environment check:', {
      hasSendGridApiKey: !!process.env.SENDGRID_API_KEY,
      hasSendGridFromEmail: !!process.env.SENDGRID_FROM_EMAIL,
      hasSendGridFromName: !!process.env.SENDGRID_FROM_NAME,
    })
    
    try {
      const emailResult = await sendBookingNotifications({
        scheduleTitle: schedule.title,
        guestName,
        guestEmail,
        hostName,
        hostEmail,
        bookingDate,
        startTime,
        endTime,
        meetLink,
        bookingMode: 'normal',
        comment: comment || null,
      })

      console.log('📧 Email notification result:', {
        allSuccess: emailResult.allSuccess,
        hostSuccess: emailResult.host.success,
        guestSuccess: emailResult.guest.success,
      })

      if (!emailResult.allSuccess) {
        // 本番環境でもエラーログを出力（機密情報を除く）
        const hostError = emailResult.host.error instanceof Error 
          ? emailResult.host.error.message 
          : emailResult.host.error ? String(emailResult.host.error).substring(0, 200) : 'Unknown error'
        const guestError = emailResult.guest.error instanceof Error 
          ? emailResult.guest.error.message 
          : emailResult.guest.error ? String(emailResult.guest.error).substring(0, 200) : 'Unknown error'
        
        console.error('⚠️ Some emails failed to send, but booking completed:', {
          hostEmailFailed: !emailResult.host.success,
          guestEmailFailed: !emailResult.guest.success,
          hostError: emailResult.host.success ? null : hostError,
          guestError: emailResult.guest.success ? null : guestError,
        })
      } else {
        console.log('✅ All emails sent successfully')
      }
    } catch (emailError) {
      // メール送信エラーはログに記録するが、予約は完了しているため続行
      // 本番環境でもエラーログを出力（機密情報を除く）
      const errorMessage = emailError instanceof Error 
        ? emailError.message 
        : String(emailError).substring(0, 200)
      const errorName = emailError instanceof Error ? emailError.name : 'Error'
      
      console.error('❌ Email sending failed, but booking completed:', {
        errorType: errorName,
        errorMessage: errorMessage,
        hasSendGridApiKey: !!process.env.SENDGRID_API_KEY,
        hasSendGridFromEmail: !!process.env.SENDGRID_FROM_EMAIL,
        hasSendGridFromName: !!process.env.SENDGRID_FROM_NAME,
      })
    }

    return NextResponse.json({ 
      success: true,
      hostEventIds,
      guestEventId,
      assignedUserId,
      assignedUserEmail: schedule.team_id ? assignedUserEmail : undefined,
      isTeamSchedule: !!schedule.team_id,
      teamMembersCount: schedule.team_id ? hostEventIds.length : undefined,
      hasMeetLink: schedule.create_meet_link || false,
    })
    
  } catch (error: unknown) {
    // 本番環境では詳細情報をログに記録（クライアントには返さない）
    if (process.env.NODE_ENV === 'production') {
      console.error('Add event API error:', error instanceof Error ? error.message : 'Unknown error')
    } else {
      console.error('Add event API error:', error)
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'An error occurred while creating the event'
          : (error instanceof Error ? error.message : 'Unknown error')
      },
      { status: 500 }
    )
  }
}
