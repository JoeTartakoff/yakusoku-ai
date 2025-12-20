'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Schedule {
  id: string
  title: string
  description: string
  date_range_start: string
  date_range_end: string
  time_slot_duration: number
  user_id: string
}

interface AvailabilitySlot {
  id: string
  date: string
  start_time: string
  end_time: string
}

interface User {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
  }
}

interface TimeBlock {
  date: string
  startTime: string
  endTime: string
}

interface Booking {
  booking_date: string
  start_time: string
  end_time: string
}

// 指定された日付が含まれる週の月曜日を取得
function getWeekStartMonday(date: Date): Date {
  const monday = new Date(date)
  const dayOfWeek = date.getDay() // 0=日曜日, 1=月曜日, ..., 6=土曜日
  // 月曜日からの日数を計算（日曜日は6、月曜日は0、火曜日は1、...）
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  monday.setDate(date.getDate() - daysFromMonday)
  return monday
}

function getDayDates(center: Date, days: number): Date[] {
  const dates: Date[] = []
  // 7日表示の場合は、その週の月曜日から開始
  const startDate = days === 7 ? getWeekStartMonday(center) : center
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)
    dates.push(date)
  }
  return dates
}

function isDateInRange(date: Date, start: string, end: string): boolean {
  const dateStr = date.toISOString().split('T')[0]
  return dateStr >= start && dateStr <= end
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function snapToHalfHour(minutes: number): number {
  return Math.round(minutes / 30) * 30
}

function timeToPixelPosition(time: string): number {
  const minutes = timeToMinutes(time)
  const baseMinutes = 9 * 60
  const relativeMinutes = minutes - baseMinutes
  return (relativeMinutes / 60) * 96
}

function groupOverlappingSlots(slots: AvailabilitySlot[]): AvailabilitySlot[][] {
  const groups: AvailabilitySlot[][] = []
  const used = new Set<number>()
  
  slots.forEach((slot, index) => {
    if (used.has(index)) return
    
    const group = [slot]
    used.add(index)
    
    slots.forEach((otherSlot, otherIndex) => {
      if (used.has(otherIndex)) return
      
      const slotStart = timeToMinutes(slot.start_time)
      const slotEnd = timeToMinutes(slot.end_time)
      const otherStart = timeToMinutes(otherSlot.start_time)
      const otherEnd = timeToMinutes(otherSlot.end_time)
      
      // 時間的に重複しているかチェック
      if (slotStart < otherEnd && slotEnd > otherStart) {
        group.push(otherSlot)
        used.add(otherIndex)
      }
    })
    
    groups.push(group)
  })
  
  return groups
}

export default function BookingPage() {
  const params = useParams()
  const shareLink = params.shareLink as string
  const guestName = params.guestName as string
  const guestEmail = params.guestEmail as string

  const [loading, setLoading] = useState(true)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [guestInfo, setGuestInfo] = useState({
    name: decodeURIComponent(guestName || ''),
    email: decodeURIComponent(guestEmail || ''),
  })
  const [submitting, setSubmitting] = useState(false)
  const [guestUser, setGuestUser] = useState<User | null>(null)
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isPrefilledGuest, setIsPrefilledGuest] = useState(false)
  const [startDate, setStartDate] = useState<Date>(new Date())
  const [viewDays, setViewDays] = useState<3 | 7>(3)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const initRef = useRef(false)
  const guestLoginProcessedRef = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchScheduleInfo = async () => {
    try {
      console.log('📋 Fetching schedule info...')
      
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('schedules')
        .select('*')
        .eq('share_link', shareLink)
        .single()

      if (scheduleError) throw scheduleError

      console.log('✅ Schedule info loaded:', scheduleData.title)
      setSchedule(scheduleData)
      setLoading(false)

      const today = new Date()
      setStartDate(today)

      return scheduleData
    } catch (error) {
      console.error('❌ Failed to load schedule:', error)
      alert('スケジュールの読み込みに失敗しました')
      setLoading(false)
      return null
    }
  }

  // ⭐ 빈 시간이 있는 최단 날짜로 자동 이동하는 함수
  const checkAndMoveToFirstAvailableDate = (slots: AvailabilitySlot[]) => {
    if (!slots || slots.length === 0) {
      console.log('📅 No slots available')
      return
    }
    
    // 今日の日付を取得 (YYYY-MM-DD形式)
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    
    // ⭐ 本日以降の空き枠のみをフィルタリング
    const futureSlots = slots.filter(slot => slot.date >= todayStr)
    
    if (futureSlots.length === 0) {
      console.log('📅 No slots available from today onwards')
      return
    }
    
    // ⭐ 本日以降で最も早い日付を探す
    const sortedSlots = [...futureSlots].sort((a, b) => a.date.localeCompare(b.date))
    const firstAvailableDate = new Date(sortedSlots[0].date)
    
    const dateStr = firstAvailableDate.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
    
    console.log(`📅 First available date (from today onwards): ${dateStr}`)
    console.log(`📅 Setting start date to: ${sortedSlots[0].date}`)
    
    // ⭐ 本日以降で最も早い日付に設定
    setStartDate(firstAvailableDate)
  }

  const fetchBookings = async (scheduleId: string) => {
    try {
      const { data: bookingsData, error } = await supabase
        .from('bookings')
        .select('booking_date, start_time, end_time')
        .eq('schedule_id', scheduleId)
        .eq('status', 'confirmed')

      if (error) {
        console.error('❌ Failed to load bookings:', error)
        return []
      }

      console.log('✅ Loaded bookings:', bookingsData?.length || 0)
      return bookingsData || []
    } catch (error) {
      console.error('❌ Error fetching bookings:', error)
      return []
    }
  }

  const fetchCalendarSlots = async (scheduleData: Schedule, guestUserId?: string) => {
    try {
      console.log('📅 Fetching calendar slots...')
      setIsLoadingSlots(true)

      // 予約済みデータを取得
      const bookingsData = await fetchBookings(scheduleData.id)
      setBookings(bookingsData)

      const response = await fetch('/api/calendar/get-available-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: scheduleData.id,
          guestUserId: guestUserId || null,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.success && result.slots && result.slots.length > 0) {
          const slotsWithId = result.slots.map((slot: any, index: number) => ({
            id: `${slot.date}-${slot.startTime}-${index}`,
            date: slot.date,
            start_time: slot.startTime,
            end_time: slot.endTime,
          }))
          
          console.log('✅ Using Calendar API slots:', slotsWithId.length)
          setAvailableSlots(slotsWithId)
          setIsLoadingSlots(false)
          
          // ⭐ 빈 시간이 있는 최단 날짜로 자동 이동
          checkAndMoveToFirstAvailableDate(slotsWithId)
          
          return
        }
      }
      
      throw new Error('Calendar API failed')
    } catch (apiError) {
      console.log('⚠️ Calendar API failed, using static slots:', apiError)
      
      const { data: slotsData, error: slotsError } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('schedule_id', scheduleData.id)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (slotsError) {
        console.error('❌ Failed to load static slots:', slotsError)
      } else {
        console.log('✅ Loaded static slots:', slotsData?.length || 0)
        setAvailableSlots(slotsData || [])
        
        // ⭐ 정적 슬롯에서도 자동 이동
        if (slotsData && slotsData.length > 0) {
          checkAndMoveToFirstAvailableDate(slotsData)
        }
      }
      
      setIsLoadingSlots(false)
    }
  }

  useEffect(() => {
    const initPage = async () => {
      if (initRef.current) return
      initRef.current = true

      console.log('🎬 Initial load')

      if (guestName && guestEmail) {
        console.log('👤 Guest info from URL:', guestName, guestEmail)
        setIsPrefilledGuest(true)
      }

      const init = async () => {
        try {
          const scheduleData = await fetchScheduleInfo()
          if (!scheduleData) return

          const { data: { user } } = await supabase.auth.getUser()
          
          if (user) {
            console.log('👤 User logged in:', user.email)
            setGuestUser(user as User)
            
            if (!guestName && !guestEmail) {
              setGuestInfo({
                name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
                email: user.email || '',
              })
            }
            
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.provider_token && session?.provider_refresh_token) {
              await supabase.from('user_tokens').upsert({
                user_id: user.id,
                access_token: session.provider_token,
                refresh_token: session.provider_refresh_token,
                expires_at: new Date(Date.now() + (session.expires_in || 3600) * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' })
            }
            
            fetchCalendarSlots(scheduleData, user.id)
          } else {
            console.log('👤 No user logged in')
            fetchCalendarSlots(scheduleData)
          }
        } catch (error) {
          console.error('❌ Init error:', error)
          setLoading(false)
        }
      }

      init()
    }

    initPage()
  }, [shareLink])

  useEffect(() => {
    if (!guestUser || guestLoginProcessedRef.current) return
    if (initRef.current && guestUser) {
      guestLoginProcessedRef.current = true
      return
    }

    guestLoginProcessedRef.current = true
    console.log('👤 Guest login detected, reloading...')

    const reload = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.provider_token && session?.provider_refresh_token) {
          await supabase.from('user_tokens').upsert({
            user_id: guestUser.id,
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token,
            expires_at: new Date(Date.now() + (session.expires_in || 3600) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
        }

        if (schedule) {
          fetchCalendarSlots(schedule, guestUser.id)
        }
      } catch (error) {
        console.error('❌ Guest login handler error:', error)
      }
    }

    reload()
  }, [guestUser?.id])

  // ドロップダウンメニューのクリックアウトサイド処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showUserMenu])

  const handleGuestLogin = async () => {
    const currentUrl = window.location.href
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar',
        redirectTo: currentUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      console.error('❌ Login error:', error)
      alert('ログインに失敗しました')
    }
  }

  const handleGuestLogout = async () => {
    await supabase.auth.signOut()
    setGuestUser(null)
    guestLoginProcessedRef.current = false
    window.location.reload()
  }

  const isHalfHourAvailable = (date: string, startTime: string): boolean => {
    const startMinutes = timeToMinutes(startTime)
    const endMinutes = startMinutes + 30
    
    return availableSlots.some(slot => 
      slot.date === date &&
      timeToMinutes(slot.start_time) <= startMinutes && 
      timeToMinutes(slot.end_time) >= endMinutes
    )
  }

  const isTimeSlotAvailable = (date: string, startTime: string, endTime: string): boolean => {
    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)
    
    // 選択された時間帯が利用可能スロットの範囲内にあるかをチェック
    // 選択時間の開始がスロットの開始以降、選択時間の終了がスロットの終了以前である必要がある
    const isInAvailableSlot = availableSlots.some(slot => {
      if (slot.date !== date) return false
      
      const slotStartMinutes = timeToMinutes(slot.start_time)
      const slotEndMinutes = timeToMinutes(slot.end_time)
      
      // 選択された時間帯がスロットの範囲内に完全に含まれているか
      // 選択時間の開始がスロットの開始以降、選択時間の終了がスロットの終了以前
      return slotStartMinutes <= startMinutes && slotEndMinutes >= endMinutes
    })
    
    if (!isInAvailableSlot) {
      return false
    }
    
    // 選択された時間帯が予約済みの時間と重複していないかチェック
    // APIから返されるavailableSlotsには既に予約済みのスロットが除外されているが、
    // 念のため再度チェック（リアルタイムで予約が追加された場合に備える）
    const hasOverlap = bookings.some(booking => {
      if (booking.booking_date !== date) return false
      
      const bookingStartMinutes = timeToMinutes(booking.start_time)
      const bookingEndMinutes = timeToMinutes(booking.end_time)
      
      // 時間帯が重複しているかチェック
      return (
        (startMinutes < bookingEndMinutes && endMinutes > bookingStartMinutes)
      )
    })
    
    return !hasOverlap
  }

  const handleSlotClick = (slot: AvailabilitySlot) => {
    if (!schedule) return
    
    setSelectedBlock({
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time
    })
    
    setShowPopup(true)
  }


  const cancelSelection = () => {
    setSelectedBlock(null)
    setShowPopup(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBlock || !schedule) return

    console.log('🚀 BOOKING SUBMISSION')

    if (submitting) {
      console.log('⚠️ Already submitting')
      return
    }

    setSubmitting(true)

    try {
      console.log('💾 Creating booking...')
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          schedule_id: schedule.id,
          guest_name: guestInfo.name,
          guest_email: guestInfo.email,
          booking_date: selectedBlock.date,
          start_time: selectedBlock.startTime,
          end_time: selectedBlock.endTime,
          status: 'confirmed',
        })

      if (bookingError) {
        console.error('❌ Booking error:', bookingError)
        throw bookingError
      }

      console.log('✅ Booking created')

      try {
        console.log('📅 Adding to calendar...')
        const response = await fetch('/api/calendar/add-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduleId: schedule.id,
            bookingDate: selectedBlock.date,
            startTime: selectedBlock.startTime,
            endTime: selectedBlock.endTime,
            guestName: guestInfo.name,
            guestEmail: guestInfo.email,
            guestUserId: guestUser?.id,
          }),
        })
        
        if (response.ok) {
          console.log('✅ Calendar event created')
        } else {
          console.log('⚠️ Calendar failed, but booking saved')
        }
      } catch (calendarError) {
        console.error('⚠️ Calendar error:', calendarError)
      }

      const bookingDate = new Date(selectedBlock.date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })

      alert(
        `予約が完了しました！\n\n` +
        `📅 日時：${bookingDate}\n` +
        `🕐 時間：${selectedBlock.startTime.slice(0, 5)} - ${selectedBlock.endTime.slice(0, 5)}\n` +
        `👤 名前：${guestInfo.name}\n` +
        `📧 メール：${guestInfo.email}\n\n` +
        `カレンダーに追加されました。`
      )
      
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      console.error('❌ Submit error:', error)
      alert('予約に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const goToPrevDays = () => {
    if (!schedule) return
    
    const prevStart = new Date(startDate)
    prevStart.setDate(startDate.getDate() - viewDays)
    
    if (isDateInRange(prevStart, schedule.date_range_start, schedule.date_range_end)) {
      setStartDate(prevStart)
    }
  }

  const goToNextDays = () => {
    if (!schedule) return
    
    const nextStart = new Date(startDate)
    nextStart.setDate(startDate.getDate() + viewDays)
    
    if (isDateInRange(nextStart, schedule.date_range_start, schedule.date_range_end)) {
      setStartDate(nextStart)
    }
  }

  const goToToday = () => {
    setStartDate(new Date())
  }

  const canGoPrev = schedule ? isDateInRange(
    new Date(startDate.getTime() - viewDays * 24 * 60 * 60 * 1000),
    schedule.date_range_start,
    schedule.date_range_end
  ) : false

  const canGoNext = schedule ? isDateInRange(
    new Date(startDate.getTime() + viewDays * 24 * 60 * 60 * 1000),
    schedule.date_range_start,
    schedule.date_range_end
  ) : false

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            スケジュールが見つかりません
          </h2>
        </div>
      </div>
    )
  }

  const hourSlots: number[] = []
  for (let hour = 9; hour <= 17; hour++) {
    hourSlots.push(hour)
  }

  const displayDates = getDayDates(startDate, viewDays).filter(date => 
    isDateInRange(date, schedule.date_range_start, schedule.date_range_end)
  )

  const blockHeightPx = schedule ? (schedule.time_slot_duration / 60) * 96 : 96

  // ユーザーのイニシャルを取得
  const getUserInitial = (email?: string) => {
    if (!email) return '?'
    const name = email.split('@')[0]
    return name.charAt(0).toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* モダンなSaaS風ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* 左側: タイトルと説明 */}
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-gray-900 truncate">
                  {schedule.title}
                </h1>
                <p className="text-sm text-gray-500 truncate">
                  {schedule.time_slot_duration}分 | {schedule.date_range_start} ～ {schedule.date_range_end}
                </p>
              </div>
              {isPrefilledGuest && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex-shrink-0">
                  ✅ 専用リンク
                </span>
              )}
            </div>

            {/* 右側: ログイン状態に応じたUI */}
            <div className="flex items-center space-x-4 ml-4">
              {guestUser ? (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {/* アバターアイコン */}
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm shadow-sm">
                        {getUserInitial(guestUser.email)}
                      </div>
                      {/* Googleロゴバッジ */}
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center border-2 border-white">
                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                      </div>
                    </div>
                    {/* ドロップダウンアイコン */}
                    <svg 
                      className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* ドロップダウンメニュー */}
                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          ログイン中
                        </p>
                        <p className="text-sm text-gray-900 truncate">
                          {guestUser.email}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowUserMenu(false)
                          handleGuestLogout()
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        ログアウト
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleGuestLogin}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Googleでログイン</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={goToPrevDays}
              disabled={!canGoPrev || isLoadingSlots}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← 前の{viewDays}日
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={goToToday}
                disabled={isLoadingSlots}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                今日
              </button>
              
              <h2 className="text-xl font-bold text-gray-900">
                {startDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={goToNextDays}
                disabled={!canGoNext || isLoadingSlots}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                次の{viewDays}日 →
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewDays(3)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewDays === 3
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  3日
                </button>
                <button
                  onClick={() => setViewDays(7)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewDays === 7
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  7日
                </button>
              </div>
            </div>
          </div>

          {isLoadingSlots ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-500">カレンダーを確認中...</p>
              <p className="text-xs text-gray-400 mt-2">Googleカレンダーと同期しています</p>
            </div>
          ) : displayDates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">この期間には予約可能な日がありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse select-none">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 p-2 text-sm font-medium text-gray-500 w-20">
                      時間
                    </th>
                    {displayDates.map((date, idx) => {
                      const today = new Date()
                      const isToday = date.toISOString().split('T')[0] === today.toISOString().split('T')[0]
                      const dayOfWeek = date.getDay()
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 // 0=日曜日, 6=土曜日
                      
                      return (
                        <th key={idx} className={`border border-gray-300 p-2 ${isWeekend ? 'bg-orange-50' : 'bg-gray-50'}`}>
                          <div className={`text-base font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                            {date.getDate()}({date.toLocaleDateString('ja-JP', { weekday: 'short' })})
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hourSlots.map((hour) => {
                    return (
                      <tr key={hour}>
                        <td className="border border-gray-300 bg-gray-50 p-2 text-sm text-gray-600 text-center align-top font-medium">
                          {String(hour).padStart(2, '0')}:00
                        </td>
                        {displayDates.map((date, dateIdx) => {
                          const dateStr = date.toISOString().split('T')[0]
                          const dayOfWeek = date.getDay()
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 // 0=日曜日, 6=土曜日
                          
                          // この日付の利用可能スロットを取得
                          const slotsForDate = availableSlots
                            .filter(slot => slot.date === dateStr)
                            .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
                          
                          // この時間帯（hour）に含まれるスロットを取得
                          const hourStartMinutes = hour * 60
                          const hourEndMinutes = (hour + 1) * 60
                          const slotsInHour = slotsForDate.filter(slot => {
                            const slotStartMinutes = timeToMinutes(slot.start_time)
                            const slotEndMinutes = timeToMinutes(slot.end_time)
                            return (
                              (slotStartMinutes >= hourStartMinutes && slotStartMinutes < hourEndMinutes) ||
                              (slotEndMinutes > hourStartMinutes && slotEndMinutes <= hourEndMinutes) ||
                              (slotStartMinutes < hourStartMinutes && slotEndMinutes > hourEndMinutes)
                            )
                          })
                          
                          // この日付の予約済み時間を取得
                          const bookingsForDate = bookings.filter(booking => booking.booking_date === dateStr)

                          return (
                            <td 
                              key={dateIdx} 
                              className={`border border-gray-300 p-0 relative ${isWeekend ? 'bg-orange-50' : 'bg-white'}`}
                              style={{ height: '96px' }}
                            >
                              {/* 予約済み時間を表示（白い背景） */}
                              {bookingsForDate.map((booking, bookingIdx) => {
                                const bookingStartMinutes = timeToMinutes(booking.start_time)
                                const bookingEndMinutes = timeToMinutes(booking.end_time)
                                
                                // この時間帯に含まれる予約のみ表示
                                if (bookingStartMinutes >= hourEndMinutes || bookingEndMinutes <= hourStartMinutes) {
                                  return null
                                }
                                
                                const bookingTop = Math.max(0, (bookingStartMinutes - hourStartMinutes) / 60 * 96)
                                const bookingBottom = Math.min(96, (bookingEndMinutes - hourStartMinutes) / 60 * 96)
                                const bookingHeight = bookingBottom - bookingTop
                                
                                return (
                                  <div
                                    key={`booking-${bookingIdx}`}
                                    className={`absolute left-0 right-0 border border-gray-300 rounded z-10 ${isWeekend ? 'bg-orange-50' : 'bg-white'}`}
                                    style={{
                                      top: `${bookingTop}px`,
                                      height: `${bookingHeight}px`
                                    }}
                                  />
                                )
                              })}
                              
                              {/* 利用可能スロットをボタンスタイルで表示 */}
                              {slotsInHour.map((slot, slotIdx) => {
                                const slotStartMinutes = timeToMinutes(slot.start_time)
                                const slotEndMinutes = timeToMinutes(slot.end_time)
                                
                                const slotTop = Math.max(0, (slotStartMinutes - hourStartMinutes) / 60 * 96)
                                const slotBottom = Math.min(96, (slotEndMinutes - hourStartMinutes) / 60 * 96)
                                const slotHeight = slotBottom - slotTop
                                
                                // ボタン間の余白を確保（各ボタンに上下に4pxの余白）
                                const BUTTON_GAP = 4
                                const adjustedTop = slotTop + BUTTON_GAP
                                const adjustedHeight = Math.max(slotHeight - (BUTTON_GAP * 2), 32)
                                
                                const isSelected = selectedBlock && 
                                                  selectedBlock.date === slot.date &&
                                                  selectedBlock.startTime === slot.start_time &&
                                                  selectedBlock.endTime === slot.end_time
                                
                                return (
                                  <div
                                    key={`slot-${slotIdx}`}
                                    className="absolute left-1 right-1 z-20 group"
                                    style={{
                                      top: `${adjustedTop}px`,
                                      height: `${adjustedHeight}px`,
                                    }}
                                  >
                                    <button
                                      className={`w-full h-full rounded-lg border-2 shadow-sm cursor-pointer transition-all duration-200 flex items-center justify-center font-medium ${
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600 text-white ring-2 ring-blue-400 ring-offset-1'
                                          : 'bg-white border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white hover:shadow-md'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleSlotClick(slot)
                                      }}
                                      style={{
                                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                                        fontSize: '1rem',
                                        letterSpacing: '0.025em',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isSelected) {
                                          const btn = e.currentTarget
                                          const timeSpan = btn.querySelector('.time-text') as HTMLElement
                                          const actionSpan = btn.querySelector('.action-text') as HTMLElement
                                          if (timeSpan) timeSpan.style.display = 'none'
                                          if (actionSpan) actionSpan.style.display = 'inline'
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isSelected) {
                                          const btn = e.currentTarget
                                          const timeSpan = btn.querySelector('.time-text') as HTMLElement
                                          const actionSpan = btn.querySelector('.action-text') as HTMLElement
                                          if (timeSpan) timeSpan.style.display = 'inline'
                                          if (actionSpan) actionSpan.style.display = 'none'
                                        }
                                      }}
                                    >
                                      <span className="time-text">
                                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                      </span>
                                      <span className="action-text" style={{ display: 'none' }}>
                                        予約する
                                      </span>
                                    </button>
                                  </div>
                                )
                              })}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showPopup && selectedBlock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  予約内容の確認
                </h2>
                <button
                  onClick={cancelSelection}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="bg-blue-50 p-4 rounded-md mb-6">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  📅 選択した日時
                </p>
                <p className="text-lg font-bold text-blue-900">
                  {new Date(selectedBlock.date).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                  })}
                </p>
                <p className="text-lg font-bold text-blue-900 mt-1">
                  {selectedBlock.startTime.slice(0, 5)} - {selectedBlock.endTime.slice(0, 5)}
                </p>
              </div>

              {isPrefilledGuest && (
                <div className="bg-green-50 p-3 rounded-md border border-green-200 mb-4">
                  <p className="text-xs text-green-800 font-medium">
                    ✅ 専用リンク
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    情報が自動入力されています
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    お名前 *
                  </label>
                  <input
                    type="text"
                    required
                    value={guestInfo.name}
                    onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                    disabled={!!guestUser || isPrefilledGuest}
                    className={`w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      (guestUser || isPrefilledGuest) ? 'bg-gray-100 text-gray-900 font-medium' : ''
                    }`}
                    placeholder="山田太郎"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    メールアドレス *
                  </label>
                  <input
                    type="email"
                    required
                    value={guestInfo.email}
                    onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                    disabled={!!guestUser || isPrefilledGuest}
                    className={`w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      (guestUser || isPrefilledGuest) ? 'bg-gray-100 text-gray-900 font-medium' : ''
                    }`}
                    placeholder="yamada@example.com"
                  />
                </div>

                {guestUser && (
                  <div className="bg-green-50 p-3 rounded-md border border-green-200">
                    <p className="text-xs text-green-800 font-medium">
                      ✅ Googleアカウント連携済み
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      カレンダーに自動追加されます
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={cancelSelection}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md disabled:bg-gray-400 transition-colors"
                  >
                    {submitting ? '予約中...' : '予約を確定する'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
