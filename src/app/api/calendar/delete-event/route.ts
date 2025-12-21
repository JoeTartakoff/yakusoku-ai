import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deleteEventSchema, formatValidationError } from '@/lib/validation'
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

async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  try {
    console.log('🗑️ Deleting calendar event:', eventId)
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    console.log('🗑️ Delete response status:', response.status)

    if (response.status === 204 || response.status === 410) {
      console.log('✅ Calendar event deleted successfully')
      return true
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Calendar API error:', errorText)
      return false
    }

    return true
  } catch (error) {
    console.error('❌ Error deleting calendar event:', error)
    return false
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
    const validationResult = deleteEventSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: formatValidationError(validationResult.error) },
        { status: 400 }
      )
    }

    const { bookingId, responseId, type } = validationResult.data

    let hostDeleted = false
    let guestDeleted = false
    let hostUserId = null
    let schedule = null

    // 통상모드
    if (type === 'booking' && bookingId) {
      console.log('\n🔵 === NORMAL MODE CANCELLATION ===')
      
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single()

      if (bookingError || !booking) {
        return NextResponse.json(
          { success: false, error: 'Booking not found' },
          { status: 404 }
        )
      }

      const { data: scheduleData } = await supabaseAdmin
        .from('schedules')
        .select('id, title, user_id, team_id')
        .eq('id', booking.schedule_id)
        .single()

      schedule = scheduleData
      hostUserId = booking.assigned_user_id || schedule?.user_id

      if (booking.host_calendar_event_id && hostUserId) {
        const { data: hostTokens } = await supabaseAdmin
          .from('user_tokens')
          .select('*')
          .eq('user_id', hostUserId)
          .maybeSingle()

        if (hostTokens) {
          let hostAccessToken = hostTokens.access_token
          const hostExpiresAt = new Date(hostTokens.expires_at)
          
          if (hostExpiresAt < new Date()) {
            const newToken = await refreshAccessToken(hostTokens.refresh_token)
            if (newToken) {
              hostAccessToken = newToken
              await supabaseAdmin
                .from('user_tokens')
                .update({
                  access_token: newToken,
                  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', hostUserId)
            }
          }

          if (hostAccessToken) {
            hostDeleted = await deleteCalendarEvent(
              hostAccessToken,
              booking.host_calendar_event_id
            )
          }
        }
      }

      if (booking.guest_calendar_event_id && booking.guest_user_id) {
        const { data: guestTokens } = await supabaseAdmin
          .from('user_tokens')
          .select('*')
          .eq('user_id', booking.guest_user_id)
          .maybeSingle()

        if (guestTokens) {
          let guestAccessToken = guestTokens.access_token
          const guestExpiresAt = new Date(guestTokens.expires_at)
          
          if (guestExpiresAt < new Date()) {
            const newToken = await refreshAccessToken(guestTokens.refresh_token)
            if (newToken) {
              guestAccessToken = newToken
              await supabaseAdmin
                .from('user_tokens')
                .update({
                  access_token: newToken,
                  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', booking.guest_user_id)
            }
          }

          if (guestAccessToken) {
            guestDeleted = await deleteCalendarEvent(
              guestAccessToken,
              booking.guest_calendar_event_id
            )
          }
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)

      if (updateError) {
        console.error('❌ Failed to update booking:', updateError)
        throw updateError
      }

      console.log('✅ Booking status updated to cancelled')
    }

    // 후보시간제시/후보일받기 모드
    if (type === 'response' && responseId) {
      console.log('\n🟣 === CANDIDATE/INTERVIEW MODE CANCELLATION ===')
      
      const { data: response, error: responseError } = await supabaseAdmin
        .from('guest_responses')
        .select('*')
        .eq('id', responseId)
        .single()

      if (responseError || !response) {
        return NextResponse.json(
          { success: false, error: 'Response not found' },
          { status: 404 }
        )
      }

      if (!response.is_confirmed) {
        return NextResponse.json(
          { success: false, error: 'Response is not confirmed' },
          { status: 400 }
        )
      }

      const { data: scheduleData } = await supabaseAdmin
        .from('schedules')
        .select('id, title, user_id, team_id')
        .eq('id', response.schedule_id)
        .single()

      schedule = scheduleData
      hostUserId = schedule?.user_id

      if (response.confirmed_slot) {
        console.log('\n🔍 Searching for related booking...')
        console.log('   schedule_id:', response.schedule_id)
        // ゲスト情報をログに出力しない（機密情報）
        console.log('   booking_date:', response.confirmed_slot.date)
        console.log('   start_time:', response.confirmed_slot.startTime)
        console.log('   end_time:', response.confirmed_slot.endTime)

        const { data: relatedBooking, error: bookingError } = await supabaseAdmin
          .from('bookings')
          .select('*')
          .eq('schedule_id', response.schedule_id)
          .eq('guest_email', response.guest_email)
          .eq('booking_date', response.confirmed_slot.date)
          .eq('start_time', response.confirmed_slot.startTime)
          .eq('end_time', response.confirmed_slot.endTime)
          .eq('status', 'confirmed')
          .maybeSingle()

        if (bookingError) {
          console.error('❌ Error searching for booking:', bookingError)
        }

        if (!relatedBooking) {
          console.log('⚠️ No exact match found, trying broader search...')
          
          const { data: allBookings } = await supabaseAdmin
            .from('bookings')
            .select('*')
            .eq('schedule_id', response.schedule_id)
            .eq('guest_email', response.guest_email)
            .eq('status', 'confirmed')
          
          console.log('📋 All confirmed bookings for this guest:', allBookings?.length || 0)
          
          if (allBookings && allBookings.length > 0) {
            console.log('📋 Booking details:')
            allBookings.forEach((b, i) => {
              console.log(`   ${i + 1}. Date: ${b.booking_date}, Time: ${b.start_time}-${b.end_time}`)
              console.log(`      Host event: ${b.host_calendar_event_id}`)
              console.log(`      Guest event: ${b.guest_calendar_event_id}`)
            })
            
            // 첫 번째 예약을 사용 (가장 최근 확정)
            const booking = allBookings[0]
            console.log('⚠️ Using first booking as fallback')
            
            if (booking.host_calendar_event_id && hostUserId) {
              const { data: hostTokens } = await supabaseAdmin
                .from('user_tokens')
                .select('*')
                .eq('user_id', hostUserId)
                .maybeSingle()

              if (hostTokens) {
                let hostAccessToken = hostTokens.access_token
                const hostExpiresAt = new Date(hostTokens.expires_at)
                
                if (hostExpiresAt < new Date()) {
                  const newToken = await refreshAccessToken(hostTokens.refresh_token)
                  if (newToken) {
                    hostAccessToken = newToken
                    await supabaseAdmin
                      .from('user_tokens')
                      .update({
                        access_token: newToken,
                        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                      })
                      .eq('user_id', hostUserId)
                  }
                }

                if (hostAccessToken) {
                  hostDeleted = await deleteCalendarEvent(
                    hostAccessToken,
                    booking.host_calendar_event_id
                  )
                }
              }
            }

            if (booking.guest_calendar_event_id && booking.guest_user_id) {
              const { data: guestTokens } = await supabaseAdmin
                .from('user_tokens')
                .select('*')
                .eq('user_id', booking.guest_user_id)
                .maybeSingle()

              if (guestTokens) {
                let guestAccessToken = guestTokens.access_token
                const guestExpiresAt = new Date(guestTokens.expires_at)
                
                if (guestExpiresAt < new Date()) {
                  const newToken = await refreshAccessToken(guestTokens.refresh_token)
                  if (newToken) {
                    guestAccessToken = newToken
                    await supabaseAdmin
                      .from('user_tokens')
                      .update({
                        access_token: newToken,
                        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                      })
                      .eq('user_id', booking.guest_user_id)
                  }
                }

                if (guestAccessToken) {
                  guestDeleted = await deleteCalendarEvent(
                    guestAccessToken,
                    booking.guest_calendar_event_id
                  )
                }
              }
            }

            await supabaseAdmin
              .from('bookings')
              .update({ status: 'cancelled' })
              .eq('id', booking.id)
          } else {
            console.log('❌ No bookings found at all for this guest/schedule')
          }
        } else {
          console.log('✅ Found exact match booking:', relatedBooking.id)
          console.log('🎫 Host event ID:', relatedBooking.host_calendar_event_id)
          console.log('🎫 Guest event ID:', relatedBooking.guest_calendar_event_id)

          if (relatedBooking.host_calendar_event_id && hostUserId) {
            const { data: hostTokens } = await supabaseAdmin
              .from('user_tokens')
              .select('*')
              .eq('user_id', hostUserId)
              .maybeSingle()

            if (hostTokens) {
              let hostAccessToken = hostTokens.access_token
              const hostExpiresAt = new Date(hostTokens.expires_at)
              
              if (hostExpiresAt < new Date()) {
                const newToken = await refreshAccessToken(hostTokens.refresh_token)
                if (newToken) {
                  hostAccessToken = newToken
                  await supabaseAdmin
                    .from('user_tokens')
                    .update({
                      access_token: newToken,
                      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', hostUserId)
                }
              }

              if (hostAccessToken) {
                hostDeleted = await deleteCalendarEvent(
                  hostAccessToken,
                  relatedBooking.host_calendar_event_id
                )
              }
            }
          }

          if (relatedBooking.guest_calendar_event_id && relatedBooking.guest_user_id) {
            const { data: guestTokens } = await supabaseAdmin
              .from('user_tokens')
              .select('*')
              .eq('user_id', relatedBooking.guest_user_id)
              .maybeSingle()

            if (guestTokens) {
              let guestAccessToken = guestTokens.access_token
              const guestExpiresAt = new Date(guestTokens.expires_at)
              
              if (guestExpiresAt < new Date()) {
                const newToken = await refreshAccessToken(guestTokens.refresh_token)
                if (newToken) {
                  guestAccessToken = newToken
                  await supabaseAdmin
                    .from('user_tokens')
                    .update({
                      access_token: newToken,
                      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', relatedBooking.guest_user_id)
                }
              }

              if (guestAccessToken) {
                guestDeleted = await deleteCalendarEvent(
                  guestAccessToken,
                  relatedBooking.guest_calendar_event_id
                )
              }
            }
          }

          await supabaseAdmin
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', relatedBooking.id)
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('guest_responses')
        .update({
          is_confirmed: false,
          confirmed_slot: null
        })
        .eq('id', responseId)

      if (updateError) {
        console.error('❌ Failed to update response:', updateError)
        throw updateError
      }

      console.log('✅ Response status updated to unconfirmed')
    }

    return NextResponse.json({ 
      success: true,
      hostDeleted,
      guestDeleted,
      message: '予約をキャンセルしました'
    })
    
  } catch (error: unknown) {
    // 本番環境では詳細情報をログに記録（クライアントには返さない）
    if (process.env.NODE_ENV === 'production') {
      console.error('Delete event API error:', error instanceof Error ? error.message : 'Unknown error')
    } else {
      console.error('Delete event API error:', error)
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'An error occurred while deleting the event'
          : (error instanceof Error ? error.message : 'Unknown error')
      },
      { status: 500 }
    )
  }
}
