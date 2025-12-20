'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { nanoid } from 'nanoid'

interface Schedule {
  id: string
  title: string
  description: string
  date_range_start: string
  date_range_end: string
  time_slot_duration: number
  candidate_slots: Array<{
    date: string
    startTime: string
    endTime: string
  }>
}

interface TimeBlock {
  id: string
  date: string
  startTime: string
  endTime: string
}

interface BlockLayout {
  block: TimeBlock
  left: number  // 左からの位置（%）
  width: number // 幅（%）
  column: number // レイアウト列のインデックス
}

function getThreeDayDates(center: Date): Date[] {
  const dates: Date[] = []
  for (let i = 0; i <= 2; i++) {
    const date = new Date(center)
    date.setDate(center.getDate() + i)
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

// 日付全体のブロックレイアウトを計算（Calendar Overlap Algorithm実装）
function calculateDateBlockLayouts(blocks: TimeBlock[], date: string): Map<string, BlockLayout> {
  // Step 1: データのソート
  // 同じ日付のブロックをフィルタリング
  const dateBlocks = blocks.filter(block => block.date === date)
  
  if (dateBlocks.length === 0) return new Map()
  
  // 開始時間の昇順でソート、開始時間が同じ場合は終了時間の降順（長いものが先）
  const sortedBlocks = [...dateBlocks].sort((a, b) => {
    const aStart = timeToMinutes(a.startTime)
    const bStart = timeToMinutes(b.startTime)
    if (aStart !== bStart) {
      return aStart - bStart
    }
    return timeToMinutes(b.endTime) - timeToMinutes(a.endTime)
  })
  
  // Step 2: 競合グループ（クラスター）の特定
  const groups: TimeBlock[][] = []
  const blockToGroup = new Map<TimeBlock, number>()
  
  sortedBlocks.forEach(block => {
    const blockStart = timeToMinutes(block.startTime)
    const blockEnd = timeToMinutes(block.endTime)
    
    // 既存のグループで、このブロックと時間的に重複するグループを探す
    const overlappingGroups = new Set<number>()
    
    groups.forEach((group, groupIdx) => {
      const hasOverlap = group.some(existingBlock => {
        const existingStart = timeToMinutes(existingBlock.startTime)
        const existingEnd = timeToMinutes(existingBlock.endTime)
        return blockStart < existingEnd && blockEnd > existingStart
      })
      
      if (hasOverlap) {
        overlappingGroups.add(groupIdx)
      }
    })
    
    // 重複するグループをマージ
    if (overlappingGroups.size > 0) {
      const groupIndices = Array.from(overlappingGroups).sort((a, b) => a - b)
      const targetGroupIdx = groupIndices[0]
      
      // 他の重複グループのブロックを統合
      for (let i = groupIndices.length - 1; i > 0; i--) {
        const mergeGroupIdx = groupIndices[i]
        groups[targetGroupIdx].push(...groups[mergeGroupIdx])
        groups[mergeGroupIdx].forEach(b => blockToGroup.set(b, targetGroupIdx))
        groups.splice(mergeGroupIdx, 1)
      }
      
      // このブロックをターゲットグループに追加
      groups[targetGroupIdx].push(block)
      blockToGroup.set(block, targetGroupIdx)
    } else {
      // 新しいグループを作成
      const newGroupIdx = groups.length
      groups.push([block])
      blockToGroup.set(block, newGroupIdx)
    }
  })
  
  // Step 3: レーン（列）の割り当て
  const layouts = new Map<string, BlockLayout>()
  
  groups.forEach((group, groupIdx) => {
    // グループ内のブロックを開始時間順にソート
    const sortedGroup = [...group].sort((a, b) => 
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    )
    
    // 各ブロックのレーン（列）を割り当て
    const lanes: TimeBlock[][] = []
    const blockToLane = new Map<TimeBlock, number>()
    
    sortedGroup.forEach(block => {
      const blockStart = timeToMinutes(block.startTime)
      const blockEnd = timeToMinutes(block.endTime)
      
      // 既存のレーンで、このブロックと時間的に重複しないレーンを探す
      let placed = false
      for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
        const laneBlocks = lanes[laneIdx]
        const hasOverlap = laneBlocks.some(existingBlock => {
          const existingStart = timeToMinutes(existingBlock.startTime)
          const existingEnd = timeToMinutes(existingBlock.endTime)
          return blockStart < existingEnd && blockEnd > existingStart
        })
        
        if (!hasOverlap) {
          lanes[laneIdx].push(block)
          blockToLane.set(block, laneIdx)
          placed = true
          break
        }
      }
      
      // 重複しないレーンがない場合は新しいレーンを作成
      if (!placed) {
        const newLaneIdx = lanes.length
        lanes.push([block])
        blockToLane.set(block, newLaneIdx)
      }
    })
    
    // Step 4: 幅と位置の最終決定
    const maxLanes = lanes.length
    
    sortedGroup.forEach(block => {
      const laneIdx = blockToLane.get(block)!
      const blockWidth = 100 / maxLanes
      const leftOffset = (100 / maxLanes) * laneIdx
      
      layouts.set(block.id, {
        block,
        column: laneIdx,
        left: leftOffset,
        width: blockWidth
      })
    })
  })
  
  return layouts
}

// キャッシュされたレイアウト情報から、指定された時間帯に関連するブロックのレイアウトを取得
function getBlockLayoutsForHour(
  dateLayouts: Map<string, BlockLayout>,
  blocks: TimeBlock[],
  date: string,
  hour: number
): BlockLayout[] {
  const hourStartMinutes = hour * 60
  const hourEndMinutes = (hour + 1) * 60
  
  // この時間帯と重複するブロックをフィルタリング
  const relevantBlocks = blocks.filter(block => {
    if (block.date !== date) return false
    const blockStart = timeToMinutes(block.startTime)
    const blockEnd = timeToMinutes(block.endTime)
    return blockStart < hourEndMinutes && blockEnd > hourStartMinutes
  })
  
  // キャッシュされたレイアウト情報から取得
  const layouts: BlockLayout[] = []
  relevantBlocks.forEach(block => {
    const layout = dateLayouts.get(block.id)
    if (layout) {
      layouts.push(layout)
    }
  })
  
  // 列順、開始時間順にソート
  return layouts.sort((a, b) => {
    if (a.column === b.column) {
      return timeToMinutes(a.block.startTime) - timeToMinutes(b.block.startTime)
    }
    return a.column - b.column
  })
}

export default function CandidatePage() {
  const params = useParams()
  const shareLink = params.shareLink as string

  const [loading, setLoading] = useState(true)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [selectedBlocks, setSelectedBlocks] = useState<TimeBlock[]>([])
  const [showPopup, setShowPopup] = useState(false)
  const [guestInfo, setGuestInfo] = useState({
    name: '',
    email: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [responseLink, setResponseLink] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date>(new Date())
  const [draggingBlockIndex, setDraggingBlockIndex] = useState<number | null>(null)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragInitialTop, setDragInitialTop] = useState(0)
  const [isPrefilledGuest, setIsPrefilledGuest] = useState(false)

  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    loadSchedule()

    const urlParams = new URLSearchParams(window.location.search)
    const nameParam = urlParams.get('name')
    const emailParam = urlParams.get('email')
    
    if (nameParam && emailParam) {
      console.log('👤 Guest info from URL:', nameParam, emailParam)
      setGuestInfo({
        name: decodeURIComponent(nameParam),
        email: decodeURIComponent(emailParam),
      })
      setIsPrefilledGuest(true)
    }
  }, [shareLink])

  // ⭐ 빈 시간이 있는 최단 날짜로 자동 이동
  const checkAndMoveToFirstAvailableDate = (slots: Array<{date: string, startTime: string, endTime: string}>) => {
    if (!slots || slots.length === 0) {
      console.log('📅 No candidate slots available')
      return
    }
    
    const sortedSlots = [...slots].sort((a, b) => a.date.localeCompare(b.date))
    const firstAvailableDate = new Date(sortedSlots[0].date)
    
    const dateStr = firstAvailableDate.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
    
    console.log(`📅 First available date: ${dateStr}`)
    setStartDate(firstAvailableDate)
  }

  const loadSchedule = async () => {
    try {
      console.log('📋 Loading schedule info...')
      
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('share_link', shareLink)
        .eq('is_candidate_mode', true)
        .single()

      if (error) throw error

      console.log('✅ Schedule loaded:', data.title)
      setSchedule(data)
      setLoading(false)

      // ⭐ 후보 시간이 있는 최단 날짜로 자동 이동
      if (data.candidate_slots && data.candidate_slots.length > 0) {
        checkAndMoveToFirstAvailableDate(data.candidate_slots)
      } else {
        const today = new Date()
        setStartDate(today)
      }
    } catch (error) {
      console.error('Error loading schedule:', error)
      alert('スケジュールの読み込みに失敗しました')
      setLoading(false)
    }
  }

  const isHalfHourInCandidates = (date: string, startTime: string): boolean => {
    if (!schedule) return false
    
    const startMinutes = timeToMinutes(startTime)
    const endMinutes = startMinutes + 30
    
    return schedule.candidate_slots.some(slot => 
      slot.date === date &&
      timeToMinutes(slot.startTime) <= startMinutes && 
      timeToMinutes(slot.endTime) >= endMinutes
    )
  }

  const isTimeSlotInCandidates = (date: string, startTime: string, endTime: string): boolean => {
    if (!schedule) return false
    
    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)
    
    for (let time = startMinutes; time < endMinutes; time += 30) {
      const currentTime = minutesToTime(time)
      if (!isHalfHourInCandidates(date, currentTime)) {
        return false
      }
    }
    
    return true
  }

  const handleCellClick = (date: string, hour: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!schedule || draggingBlockIndex !== null) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const cellHeight = rect.height
    
    const minute = clickY < cellHeight / 2 ? 0 : 30
    
    const startMinutes = hour * 60 + minute
    const startTime = minutesToTime(startMinutes)
    const endMinutes = startMinutes + schedule.time_slot_duration
    const endTime = minutesToTime(endMinutes)
    
    if (!isTimeSlotInCandidates(date, startTime, endTime)) {
      alert('この時間帯は選択できません')
      return
    }
    
    const existingIndex = selectedBlocks.findIndex(
      b => {
        if (b.date !== date) return false
        const bStart = timeToMinutes(b.startTime)
        const bEnd = timeToMinutes(b.endTime)
        const newStart = timeToMinutes(startTime)
        const newEnd = timeToMinutes(endTime)
        // 時間的に重複しているかチェック
        return newStart < bEnd && newEnd > bStart
      }
    )
    
    if (existingIndex >= 0) {
      setSelectedBlocks(selectedBlocks.filter((_, i) => i !== existingIndex))
    } else {
      const newBlock: TimeBlock = {
        id: nanoid(10),
        date,
        startTime,
        endTime
      }
      setSelectedBlocks([...selectedBlocks, newBlock])
    }
  }

  const handleBlockMouseDown = (e: React.MouseEvent, blockIndex: number) => {
    e.stopPropagation()
    e.preventDefault()
    
    setDraggingBlockIndex(blockIndex)
    setDragStartY(e.clientY)
    setDragInitialTop(timeToMinutes(selectedBlocks[blockIndex].startTime))
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (draggingBlockIndex === null || !schedule) return
    
    const block = selectedBlocks[draggingBlockIndex]
    
    const deltaY = e.clientY - dragStartY
    const deltaMinutes = Math.round((deltaY / 96) * 60)
    
    let newStartMinutes = dragInitialTop + deltaMinutes
    newStartMinutes = snapToHalfHour(newStartMinutes)
    
    const minMinutes = 9 * 60
    const maxMinutes = 18 * 60 - schedule.time_slot_duration
    
    if (newStartMinutes < minMinutes) newStartMinutes = minMinutes
    if (newStartMinutes > maxMinutes) newStartMinutes = maxMinutes
    
    const newStartTime = minutesToTime(newStartMinutes)
    const newEndMinutes = newStartMinutes + schedule.time_slot_duration
    const newEndTime = minutesToTime(newEndMinutes)
    
    if (!isTimeSlotInCandidates(block.date, newStartTime, newEndTime)) {
      return
    }
    
    const newBlocks = [...selectedBlocks]
    newBlocks[draggingBlockIndex] = {
      ...block,
      startTime: newStartTime,
      endTime: newEndTime
    }
    setSelectedBlocks(newBlocks)
  }

  const handleMouseUp = () => {
    setDraggingBlockIndex(null)
  }

  useEffect(() => {
    if (draggingBlockIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [draggingBlockIndex, selectedBlocks, schedule, dragStartY, dragInitialTop])

  const removeBlock = (blockIndex: number) => {
    setSelectedBlocks(selectedBlocks.filter((_, i) => i !== blockIndex))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schedule || selectedBlocks.length === 0) return

    setSubmitting(true)

    try {
      const shareToken = nanoid(10)

      const slotsToSave = selectedBlocks.map(({ date, startTime, endTime }) => ({
        date,
        startTime,
        endTime
      }))

      const { error } = await supabase
        .from('guest_responses')
        .insert({
          schedule_id: schedule.id,
          guest_name: guestInfo.name,
          guest_email: guestInfo.email,
          selected_slots: slotsToSave,
          share_token: shareToken,
          is_confirmed: false,
        })

      if (error) throw error

      const link = `${window.location.origin}/response/${shareToken}`
      setResponseLink(link)

      alert('候補時間を送信しました！\nリンクをホストに共有してください。')
    } catch (error) {
      console.error('Error submitting response:', error)
      alert('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const copyResponseLink = () => {
    if (responseLink) {
      navigator.clipboard.writeText(responseLink)
      alert('リンクをコピーしました！')
    }
  }

  const goToPrev3Days = () => {
    if (!schedule) return
    
    const prevStart = new Date(startDate)
    prevStart.setDate(startDate.getDate() - 3)
    
    if (isDateInRange(prevStart, schedule.date_range_start, schedule.date_range_end)) {
      setStartDate(prevStart)
    }
  }

  const goToNext3Days = () => {
    if (!schedule) return
    
    const nextStart = new Date(startDate)
    nextStart.setDate(startDate.getDate() + 3)
    
    if (isDateInRange(nextStart, schedule.date_range_start, schedule.date_range_end)) {
      setStartDate(nextStart)
    }
  }

  const goToToday = () => {
    setStartDate(new Date())
  }

  const canGoPrev = schedule ? isDateInRange(
    new Date(startDate.getTime() - 3 * 24 * 60 * 60 * 1000),
    schedule.date_range_start,
    schedule.date_range_end
  ) : false

  const canGoNext = schedule ? isDateInRange(
    new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000),
    schedule.date_range_start,
    schedule.date_range_end
  ) : false

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
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

  if (responseLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              送信完了！
            </h2>
            <p className="text-gray-600 mb-4">
              以下のリンクをホストに共有してください
            </p>
            <div className="bg-gray-50 p-3 rounded-md mb-4">
              <p className="text-sm text-gray-800 break-all">{responseLink}</p>
            </div>
            <button
              onClick={copyResponseLink}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md"
            >
              リンクをコピー
            </button>
          </div>
        </div>
      </div>
    )
  }

  const hourSlots: number[] = []
  for (let hour = 9; hour <= 17; hour++) {
    hourSlots.push(hour)
  }

  const displayDates = getThreeDayDates(startDate).filter(date => 
    isDateInRange(date, schedule.date_range_start, schedule.date_range_end)
  )

  // 日付ごとのブロックレイアウトをキャッシュ
  const dateLayoutsMap = useMemo(() => {
    const layoutsMap = new Map<string, Map<string, BlockLayout>>()
    displayDates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0]
      layoutsMap.set(dateStr, calculateDateBlockLayouts(selectedBlocks, dateStr))
    })
    return layoutsMap
  }, [selectedBlocks, displayDates])

  const blockHeightPx = schedule ? (schedule.time_slot_duration / 60) * 96 : 96

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {schedule.title}
              </h1>
              {schedule.description && (
                <p className="text-gray-600">{schedule.description}</p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  📋 候補時間を提示
                </span>
                {isPrefilledGuest && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✅ 専用リンク
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm text-gray-600">
            📌 カレンダーで時間をクリックして選択してください（複数選択可）　予約時間: {schedule.time_slot_duration}分
          </p>
          {selectedBlocks.length > 0 && (
            <p className="text-xs text-gray-600 mt-2 font-medium">
              ✅ {selectedBlocks.length}個の時間を選択中
            </p>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={goToPrev3Days}
              disabled={!canGoPrev}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← 前の3日
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={goToToday}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                今日
              </button>
              
              <h2 className="text-lg font-medium text-gray-900">
                {startDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
              </h2>
            </div>
            
            <button
              onClick={goToNext3Days}
              disabled={!canGoNext}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              次の3日 →
            </button>
          </div>

          {displayDates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">この期間には予約可能な日がありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full border-collapse select-none">
                <thead>
                  <tr>
                    <th className="border border-gray-200 bg-gray-50 p-2 text-xs font-medium text-gray-500 w-20">
                      時間
                    </th>
                    {displayDates.map((date, idx) => {
                      const today = new Date()
                      const isToday = date.toISOString().split('T')[0] === today.toISOString().split('T')[0]
                      const dayOfWeek = date.getDay()
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 // 0=日曜日, 6=土曜日
                      
                      return (
                        <th key={idx} className={`border border-gray-200 p-2 text-sm font-medium text-gray-900 ${isWeekend ? 'bg-orange-50' : 'bg-gray-50'}`}>
                          <div>
                            {date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                            {date.toLocaleDateString('ja-JP', { weekday: 'short' })}
                            {isToday && <span className="text-red-500 text-lg leading-none">●</span>}
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
                        <td className="border border-gray-300 bg-gray-50 p-2 text-xs text-gray-600 text-center align-top">
                          {String(hour).padStart(2, '0')}:00
                        </td>
                        {displayDates.map((date, dateIdx) => {
                          const dateStr = date.toISOString().split('T')[0]
                          const dayOfWeek = date.getDay()
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 // 0=日曜日, 6=土曜日
                          
                          const firstHalfTime = `${String(hour).padStart(2, '0')}:00`
                          const secondHalfTime = `${String(hour).padStart(2, '0')}:30`
                          const isFirstHalfAvailable = isHalfHourInCandidates(dateStr, firstHalfTime)
                          const isSecondHalfAvailable = isHalfHourInCandidates(dateStr, secondHalfTime)

                          return (
                            <td 
                              key={dateIdx} 
                              className={`border border-gray-300 p-0 relative ${isWeekend ? 'bg-orange-50' : 'bg-white'}`}
                              style={{ height: '96px' }}
                              onClick={(e) => handleCellClick(dateStr, hour, e)}
                            >
                              <div 
                                className={`absolute top-0 left-0 right-0 cursor-pointer transition-colors ${
                                  isFirstHalfAvailable 
                                    ? 'hover:bg-purple-50' 
                                    : 'bg-gray-200 cursor-not-allowed'
                                }`}
                                style={{ height: '48px' }}
                              >
                                {!isFirstHalfAvailable && (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-xs text-gray-400 font-medium opacity-80">選択不可</span>
                                  </div>
                                )}
                              </div>
                              
                              <div 
                                className="absolute left-0 right-0 border-t border-dashed border-gray-300 pointer-events-none z-10" 
                                style={{ top: '48px' }} 
                              />
                              
                              <div 
                                className={`absolute bottom-0 left-0 right-0 cursor-pointer transition-colors ${
                                  isSecondHalfAvailable 
                                    ? 'hover:bg-purple-50' 
                                    : 'bg-gray-200 cursor-not-allowed'
                                }`}
                                style={{ height: '48px' }}
                              >
                                {!isSecondHalfAvailable && (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-xs text-gray-400 font-medium opacity-80">選択不可</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              
              {/* ブロックを日付列全体に一度だけレンダリング */}
              <div className="absolute top-0 left-0 w-full" style={{ height: `${(18 - 9) * 96}px`, pointerEvents: 'none' }}>
                {displayDates.map((date, dateIdx) => {
                  const dateStr = date.toISOString().split('T')[0]
                  const dateLayouts = dateLayoutsMap.get(dateStr)
                  
                  if (!dateLayouts || dateLayouts.size === 0) return null
                  
                  // この日付のすべてのブロックを取得（重複を防ぐため、各ブロックを一度だけ）
                  const allBlocksForDate = Array.from(dateLayouts.values())
                  
                  if (allBlocksForDate.length === 0) return null
                  
                  // マージンを考慮した幅と位置を計算
                  const margin = 2 // ブロック間のマージン（px）
                  const maxColumns = Math.max(...allBlocksForDate.map(l => l.column)) + 1
                  
                  return (
                    <div
                      key={dateIdx}
                      className="absolute top-0"
                      style={{
                        left: `calc(${100 / (displayDates.length + 1)}% * ${dateIdx + 1})`,
                        width: `calc(${100 / (displayDates.length + 1)}%)`,
                        height: `${(18 - 9) * 96}px`, // 09:00から18:00まで
                        pointerEvents: 'auto',
                        zIndex: 10
                      }}
                    >
                      {allBlocksForDate.map((layout) => {
                        const block = layout.block
                        const blockIdx = selectedBlocks.findIndex(b => b.id === block.id)
                        const blockTopPosition = timeToPixelPosition(block.startTime) // 日付列全体に対する絶対位置
                        const isDraggingThis = draggingBlockIndex === blockIdx
                        
                        // 幅と位置を計算（マージンを考慮）
                        const columnWidthPercent = 100 / maxColumns
                        const leftOffsetPercent = layout.column * columnWidthPercent
                        
                        return (
                          <div
                            key={block.id}
                            className={`absolute bg-purple-600 text-white rounded shadow-lg flex flex-col items-center justify-center text-xs font-medium z-20 ${
                              isDraggingThis ? 'cursor-grabbing' : 'cursor-move'
                            }`}
                            style={{
                              top: `${blockTopPosition}px`,
                              height: `${blockHeightPx}px`,
                              left: `${leftOffsetPercent}%`,
                              width: `calc(${columnWidthPercent}% - ${margin}px)`,
                              marginLeft: layout.column > 0 ? `${margin}px` : '0',
                            }}
                            onMouseDown={(e) => handleBlockMouseDown(e, blockIdx)}
                          >
                            <div className="text-center relative w-full px-1">
                              <div className="whitespace-normal break-words">{block.startTime.slice(0, 5)} - {block.endTime.slice(0, 5)}</div>
                              <div className="text-[10px] opacity-80 mt-1">ドラッグで調整</div>
                              
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeBlock(blockIdx)
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm flex items-center justify-center hover:bg-red-600 transition-colors shadow-md z-30"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {selectedBlocks.length > 0 && (
          <div className="fixed bottom-8 right-8 z-40">
            <button
              onClick={() => setShowPopup(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-4 px-6 rounded-full shadow-lg transition-all hover:scale-105"
            >
              候補時間を送信 ({selectedBlocks.length}個)
            </button>
          </div>
        )}
      </div>

      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  候補時間の送信
                </h2>
                <button
                  onClick={() => setShowPopup(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="bg-purple-50 p-4 rounded-md mb-6">
                <p className="text-sm font-medium text-purple-900 mb-2">
                  📅 選択した時間: {selectedBlocks.length}個
                </p>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {selectedBlocks.map((block, idx) => (
                    <div key={block.id} className="flex items-center justify-between bg-white p-2 rounded border border-purple-200">
                      <p className="text-xs text-purple-700 whitespace-normal break-words">
                        {new Date(block.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} {block.startTime.slice(0, 5)} - {block.endTime.slice(0, 5)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeBlock(idx)}
                        className="w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
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
                    disabled={isPrefilledGuest}
                    className={`w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                      isPrefilledGuest ? 'bg-gray-100 text-gray-900 font-medium' : ''
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
                    disabled={isPrefilledGuest}
                    className={`w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                      isPrefilledGuest ? 'bg-gray-100 text-gray-900 font-medium' : ''
                    }`}
                    placeholder="yamada@example.com"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPopup(false)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-md disabled:bg-gray-400 transition-colors"
                  >
                    {submitting ? '送信中...' : '候補時間を送信'}
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
