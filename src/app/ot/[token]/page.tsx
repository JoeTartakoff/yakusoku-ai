'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import BookingPage from '@/app/book/[shareLink]/page'

export default function OneTimeBookingPage() {
  const params = useParams()
  const token = params.token as string
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const verifyAndGetScheduleId = async () => {
      try {
        // トークンを検証
        const response = await fetch('/api/one-time-token/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })

        const result = await response.json()

        if (!result.valid) {
          setError(result.message || 'このリンクは無効です')
          setLoading(false)
          return
        }

        // schedule_idを設定（リダイレクトしない）
        setScheduleId(result.scheduleId)
        setLoading(false)
      } catch (error) {
        console.error('Error verifying token:', error)
        setError('トークンの検証に失敗しました')
        setLoading(false)
      }
    }

    verifyAndGetScheduleId()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">リンクエラー</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  // schedule_idが取得できたら、予約ページコンポーネントを表示
  // scheduleIdParamとoneTimeTokenParamをpropsとして渡す
  if (scheduleId) {
    return <BookingPage scheduleIdParam={scheduleId} oneTimeTokenParam={token} />
  }

  return null
}
