# アポ調整URL表示の高速化最適化案

## 🔍 現状のボトルネック分析

### 1. 順次データ取得
- スケジュール情報取得 → 予約情報取得 → カレンダースロット取得
- 各処理が順次実行されているため、合計時間が長い

### 2. Google Calendar API呼び出し
- カレンダーイベント取得に時間がかかる（数百ms〜数秒）
- 複数ユーザーの場合、さらに時間がかかる

### 3. クライアントサイドでの重い処理
- スロット計算がクライアント側で実行
- 大きなデータセットの処理

## 🚀 最適化案

### 優先度1: 並列データ取得（即効性が高い）

**現状の問題**:
```typescript
// 順次実行
const scheduleData = await fetchScheduleInfo()
const bookingsData = await fetchBookings(scheduleData.id)
const slots = await fetchCalendarSlots(scheduleData)
```

**最適化後**:
```typescript
// 並列実行
const [scheduleData, bookingsData] = await Promise.all([
  fetchScheduleInfo(),
  // スケジュールIDが分かる場合は並列取得可能
])

// スケジュール情報が取得できたら、カレンダースロット取得を開始
const slots = await fetchCalendarSlots(scheduleData)
```

**期待される効果**: 初回表示時間を30-50%短縮

---

### 優先度2: サーバーサイドでの初期データ取得（SSR）

**実装方法**:
```typescript
// app/book/[shareLink]/page.tsx
export async function generateMetadata({ params }: { params: { shareLink: string } }) {
  // メタデータ取得
}

// サーバーサイドでスケジュール情報を事前取得
export default async function BookingPage({ params }: { params: { shareLink: string } }) {
  const schedule = await getScheduleByShareLink(params.shareLink)
  
  return <BookingPageClient initialSchedule={schedule} />
}
```

**期待される効果**: 
- 初回表示時間を40-60%短縮
- SEO向上
- スケルトンUI不要（データが既に存在）

---

### 優先度3: 段階的ローディング（Progressive Loading）

**実装方法**:
```typescript
// 最初の1週間だけ先に取得
const fetchCalendarSlotsProgressive = async (scheduleData: Schedule) => {
  const today = new Date()
  const oneWeekLater = new Date(today)
  oneWeekLater.setDate(today.getDate() + 7)
  
  // 最初の1週間を優先的に取得
  const firstWeekSlots = await fetchCalendarSlots(
    scheduleData,
    undefined,
    today.toISOString().split('T')[0],
    oneWeekLater.toISOString().split('T')[0]
  )
  
  setAvailableSlots(firstWeekSlots)
  
  // 残りの期間はバックグラウンドで取得
  if (scheduleData.date_range_end > oneWeekLater.toISOString().split('T')[0]) {
    fetchCalendarSlots(
      scheduleData,
      undefined,
      oneWeekLater.toISOString().split('T')[0],
      scheduleData.date_range_end
    ).then(remainingSlots => {
      setAvailableSlots(prev => [...prev, ...remainingSlots])
    })
  }
}
```

**期待される効果**: 
- 初回表示時間を50-70%短縮
- ユーザーはすぐに予約可能な日付を確認できる

---

### 優先度4: APIレスポンスのキャッシュ

**実装方法**:
```typescript
// app/api/calendar/get-available-slots/route.ts
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { scheduleId, guestUserId, dateStart, dateEnd } = await request.json()
  
  // キャッシュキー生成
  const cacheKey = `slots-${scheduleId}-${guestUserId || 'guest'}-${dateStart || 'all'}-${dateEnd || 'all'}`
  
  // 短時間キャッシュ（5分）
  const cached = await getCache(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })
  }
  
  // データ取得
  const result = await fetchSlots(...)
  
  // キャッシュに保存
  await setCache(cacheKey, result, 300) // 5分
  
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    }
  })
}
```

**期待される効果**: 
- 同じスケジュールへの再アクセス時に90%以上高速化
- API呼び出し回数の削減

---

### 優先度5: React最適化（再レンダリング削減）

**実装方法**:
```typescript
// メモ化されたコンポーネント
const SlotCalendar = React.memo(({ slots, onSelect }: Props) => {
  // ...
}, (prevProps, nextProps) => {
  return prevProps.slots.length === nextProps.slots.length
})

// useMemoで重い計算をキャッシュ
const groupedSlots = useMemo(() => {
  return groupOverlappingSlots(availableSlots)
}, [availableSlots])

// useCallbackで関数をメモ化
const handleSlotClick = useCallback((slot: AvailabilitySlot) => {
  setSelectedBlock(slot)
}, [])
```

**期待される効果**: 
- スクロールや日付変更時のパフォーマンス向上
- 不要な再レンダリングを削減

---

### 優先度6: データベースクエリの最適化

**実装方法**:
```typescript
// インデックスの確認と追加
// schedules テーブル: share_link にインデックス
// bookings テーブル: (schedule_id, status) に複合インデックス
// availability_slots テーブル: (schedule_id, date) に複合インデックス

// 必要なカラムのみ取得
const { data } = await supabase
  .from('schedules')
  .select('id, title, date_range_start, date_range_end, time_slot_duration') // 必要なカラムのみ
  .eq('share_link', shareLink)
  .single()
```

**期待される効果**: 
- データベースクエリ時間を20-40%短縮
- ネットワーク転送量の削減

---

### 優先度7: スケルトンUIとストリーミング

**実装方法**:
```typescript
// Suspenseとストリーミングを活用
import { Suspense } from 'react'

export default function BookingPage() {
  return (
    <div>
      <Suspense fallback={<ScheduleSkeleton />}>
        <ScheduleInfo />
      </Suspense>
      
      <Suspense fallback={<SlotsSkeleton />}>
        <AvailableSlots />
      </Suspense>
    </div>
  )
}
```

**期待される効果**: 
- ユーザー体感速度の向上
- 段階的なコンテンツ表示

---

## 📊 期待される総合効果

| 最適化 | 効果 | 実装難易度 | 優先度 |
|--------|------|-----------|--------|
| 並列データ取得 | 30-50%短縮 | 低 | ⭐⭐⭐⭐⭐ |
| 段階的ローディング | 50-70%短縮 | 中 | ⭐⭐⭐⭐ |
| SSR | 40-60%短縮 | 中 | ⭐⭐⭐⭐ |
| APIキャッシュ | 再アクセス時90%短縮 | 中 | ⭐⭐⭐ |
| React最適化 | 操作時の快適性向上 | 低 | ⭐⭐⭐ |
| DB最適化 | 20-40%短縮 | 低 | ⭐⭐ |
| スケルトンUI | 体感速度向上 | 低 | ⭐⭐ |

## 🎯 推奨実装順序

1. **フェーズ1（即効性）**: 並列データ取得 + 段階的ローディング
2. **フェーズ2（中期的）**: SSR + APIキャッシュ
3. **フェーズ3（長期的）**: React最適化 + DB最適化 + スケルトンUI

## 💡 追加の最適化アイデア

### 1. プリフェッチング
```typescript
// リンクホバー時にデータを事前取得
<Link 
  href={`/book/${shareLink}`}
  onMouseEnter={() => prefetchSchedule(shareLink)}
>
```

### 2. Service Workerによるキャッシュ
```typescript
// オフライン対応とキャッシュ
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/calendar/get-available-slots')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request)
      })
    )
  }
})
```

### 3. バックグラウンド更新
```typescript
// ページ表示後、バックグラウンドで最新データを取得
useEffect(() => {
  // 初期表示後、最新データを取得
  setTimeout(() => {
    fetchCalendarSlots(schedule, guestUserId)
  }, 1000)
}, [])
```

## 📝 実装時の注意点

1. **キャッシュの無効化**: 予約が確定したら、該当スケジュールのキャッシュを無効化
2. **エラーハンドリング**: 段階的ローディング時のエラー処理
3. **ユーザー体験**: ローディング状態の適切な表示
4. **モバイル対応**: モバイル環境でのパフォーマンス確認


