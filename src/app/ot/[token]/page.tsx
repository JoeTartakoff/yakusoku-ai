'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export default function OneTimeBookingPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const verifyAndRedirect = async () => {
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

        // トークンが有効な場合、schedule_idからshare_linkを取得
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { data: scheduleData, error: scheduleError } = await supabase
          .from('schedules')
          .select('share_link')
          .eq('id', result.scheduleId)
          .single()

        if (scheduleError || !scheduleData) {
          setError('スケジュールが見つかりません')
          setLoading(false)
          return
        }

        // 通常の予約ページにリダイレクト（トークンをクエリパラメータとして付与）
        router.push(`/book/${scheduleData.share_link}?token=${token}`)
      } catch (error) {
        console.error('Error verifying token:', error)
        setError('トークンの検証に失敗しました')
        setLoading(false)
      }
    }

    verifyAndRedirect()
  }, [token, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
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
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  return null
}
