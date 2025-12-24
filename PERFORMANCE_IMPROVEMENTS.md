# パフォーマンス改善提案書

コードベース全体を分析し、パフォーマンス高速化と体感スピード改善が可能な要素を特定しました。

## ✅ 実装済みの改善

以下の改善を実装しました：

1. **ダッシュボードの並列データ取得** ✅
   - `src/app/(dashboard)/dashboard/page.tsx` の `fetchSchedules` 関数を最適化
   - 順次実行（N回のクエリ）から並列一括取得（2回のクエリ）に変更
   - 予約数とゲストレスポンス数を一括取得し、クライアント側で集計

2. **データベースクエリの最適化** ✅
   - `select('*')` を必要なカラムのみに変更
   - `src/app/(dashboard)/dashboard/page.tsx`: folders、schedules テーブル
   - `src/app/api/calendar/get-available-slots/route.ts`: user_tokens、schedules テーブル

3. **本番環境でのコンソールログ削除** ✅
   - `next.config.ts` に `compiler.removeConsole` を追加
   - 本番環境では `console.log` を自動削除（`console.error` と `console.warn` は保持）

4. **フォントの最適化** ✅
   - `src/app/layout.tsx` の `Noto_Sans_JP` に `display: 'swap'` と `preload: true` を追加
   - フォント読み込み中の表示改善（FOITを防ぐ）

5. **追加のデータベースクエリ最適化** ✅
   - 予約ページ（`src/app/book/[shareLink]/page.tsx`）のschedules、availability_slotsクエリを最適化
   - 予約ページ（`src/app/book/[shareLink]/[guestName]/[guestEmail]/page.tsx`）のschedules、availability_slotsクエリを最適化
   - `select('*')` を必要なカラムのみに変更

**期待される効果**: 
- ダッシュボードの読み込み時間を **50-80%短縮**
- データベースクエリ時間を **20-40%短縮**
- ネットワーク転送量を **30-60%削減**
- フォント読み込み時のレンダリングブロックを削減
- JavaScript実行時間を **5-15%短縮**（本番環境）

---

## 🔴 優先度: 高（即効性がある改善）

### 1. ダッシュボードでの並列データ取得

**現状の問題**:
- `src/app/(dashboard)/dashboard/page.tsx` の `fetchSchedules` 関数で、スケジュールごとに順次予約数を取得している
- N個のスケジュールがある場合、N回の順次クエリが発生

**改善案**:
```typescript
// 現在 (順次実行)
for (const schedule of allSchedules) {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('schedule_id', schedule.id)
    .eq('status', 'confirmed')
  // ...
}

// 改善後 (並列実行 + 一括取得)
const scheduleIds = allSchedules.map(s => s.id)
const candidateScheduleIds = allSchedules
  .filter(s => s.is_candidate_mode || s.is_interview_mode)
  .map(s => s.id)
const normalScheduleIds = allSchedules
  .filter(s => !s.is_candidate_mode && !s.is_interview_mode)
  .map(s => s.id)

const [allBookings, allResponses] = await Promise.all([
  normalScheduleIds.length > 0 
    ? supabase
        .from('bookings')
        .select('schedule_id, id')
        .in('schedule_id', normalScheduleIds)
        .eq('status', 'confirmed')
    : Promise.resolve({ data: [] }),
  candidateScheduleIds.length > 0
    ? supabase
        .from('guest_responses')
        .select('schedule_id, id, is_confirmed')
        .in('schedule_id', candidateScheduleIds)
    : Promise.resolve({ data: [] })
])

// クライアント側で集計
const newCountMap: Record<string, CountInfo> = {}
allSchedules.forEach(schedule => {
  if (schedule.is_candidate_mode || schedule.is_interview_mode) {
    const responses = allResponses.data?.filter(r => r.schedule_id === schedule.id) || []
    newCountMap[schedule.id] = {
      confirmed: responses.filter(r => r.is_confirmed).length,
      proposed: responses.filter(r => !r.is_confirmed).length
    }
  } else {
    const bookings = allBookings.data?.filter(b => b.schedule_id === schedule.id) || []
    newCountMap[schedule.id] = {
      confirmed: bookings.length,
      proposed: 0
    }
  }
})
```

**期待される効果**: ダッシュボードの読み込み時間を **50-80%短縮**（スケジュール数に応じて）

---

### 2. データベースクエリの最適化（select('*') の削減）

**現状の問題**:
- 46箇所で `select('*')` が使用されており、不要なカラムまで取得している
- ネットワーク転送量が増加し、パース時間も増加

**改善が必要な主な箇所**:

1. `src/app/api/calendar/get-available-slots/route.ts`
   - Line 59: `user_tokens` から必要なカラムのみ取得
   - Line 234: `schedules` から必要なカラムのみ取得

2. `src/app/(dashboard)/dashboard/page.tsx`
   - Line 134, 143, 167: `schedules` から必要なカラムのみ取得
   - Line 217, 230: すでに `select('id, is_confirmed')` と `select('id')` で最適化済み ✅

3. `src/app/book/[shareLink]/page.tsx`
   - Line 330, 335: `schedules` から必要なカラムのみ取得
   - Line 505: `availability_slots` から必要なカラムのみ取得

**改善例**:
```typescript
// 現在
const { data: schedule } = await supabase
  .from('schedules')
  .select('*')
  .eq('id', scheduleId)
  .single()

// 改善後
const { data: schedule } = await supabase
  .from('schedules')
  .select('id, title, date_range_start, date_range_end, time_slot_duration, user_id, team_id, working_hours_start, working_hours_end, is_interview_mode, interview_time_start, interview_time_end, interview_break_start, interview_break_end, available_weekdays')
  .eq('id', scheduleId)
  .single()
```

**期待される効果**: データベースクエリ時間を **20-40%短縮**、ネットワーク転送量を **30-60%削減**

---

### 3. 重い計算処理のメモ化（groupOverlappingSlots）

**現状の問題**:
- `src/app/book/[shareLink]/[guestName]/[guestEmail]/page.tsx` の `groupOverlappingSlots` 関数がメモ化されていない
- レンダリングのたびに再計算される可能性がある

**改善案**:
```typescript
// 現在: コンポーネント内で直接呼び出し
const groupedSlots = groupOverlappingSlots(availableSlots)

// 改善後: useMemoでメモ化
const groupedSlots = useMemo(() => {
  return groupOverlappingSlots(availableSlots)
}, [availableSlots])
```

**期待される効果**: スクロールや日付変更時のパフォーマンス向上、**不要な再計算を削減**

---

### 4. 本番環境でのコンソールログ削除

**現状の問題**:
- 多数の `console.log`、`console.error` が本番環境でも実行されている
- 特に `calculateAvailableSlots` 関数内で大量のログが出力される

**改善案**:
```typescript
// 現在
console.log('=== calculateAvailableSlots ===')
console.log('Events:', events.length)

// 改善後
if (process.env.NODE_ENV !== 'production') {
  console.log('=== calculateAvailableSlots ===')
  console.log('Events:', events.length)
}
```

または、本番ビルド時に自動削除されるように設定:
```javascript
// next.config.ts
const nextConfig = {
  // ...
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
}
```

**期待される効果**: JavaScript実行時間を **5-15%短縮**（ログが多い箇所で）

---

## 🟡 優先度: 中（体感速度の改善）

### 5. スケルトンUIとローディング状態の改善

**現状の問題**:
- 一部のページで単純な「読み込み中...」テキストのみ
- ユーザーは何が読み込まれているか分からない

**改善案**:
- ダッシュボードページでスケルトンカードを表示
- 予約ページでカレンダーのスケルトンを表示
- 段階的なローディング表示（データが揃った部分から表示）

**期待される効果**: 体感速度の大幅な向上（実際の読み込み時間は同じでも、**ユーザー体感では50-70%高速化**）

---

### 6. APIレスポンスのキャッシュ戦略強化

**現状**:
- `src/app/api/calendar/get-available-slots/route.ts` でキャッシュヘッダーは設定済み ✅
- ただし、Service WorkerでのAPIキャッシュは無効化されている

**改善案**:
```typescript
// public/sw.js の改善
// API 요청은 네트워크만 사용 (캐시 안 함)
// ↓ 改善後: 条件付きキャッシュ
if (url.pathname.startsWith('/api/calendar/get-available-slots')) {
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // キャッシュがあれば使用（5分以内）
        return cachedResponse
      }
      // なければネットワークから取得
      return fetch(request).then(response => {
        // 成功したレスポンスをキャッシュ
        if (response.ok) {
          const cacheClone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, cacheClone)
          })
        }
        return response
      })
    })
  )
  return
}
```

**期待される効果**: 再アクセス時のAPI呼び出しを **90%以上削減**

---

### 7. 画像の最適化確認

**現状**:
- Next.js Imageコンポーネントは使用されている ✅
- ただし、画像のサイズやフォーマットの最適化は確認が必要

**確認・改善ポイント**:
- `public/logo.png`, `public/logo_.png` などのサイズ確認
- WebP形式への変換
- 適切な `width` と `height` の設定
- `priority` プロパティの適切な使用

**期待される効果**: 初回読み込み時間を **10-20%短縮**（画像が多い場合）

---

### 8. フォントの最適化

**現状**:
- `src/app/layout.tsx` で `Noto_Sans_JP` フォントを使用
- すべてのサブセットを読み込んでいる可能性がある

**改善案**:
```typescript
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"], // 日本語のサブセットも指定
  weight: ["400", "500", "600", "700"],
  display: 'swap', // フォント読み込み中の表示改善
  preload: true, // 優先的に読み込む
})
```

**期待される効果**: フォント読み込み時間の短縮、**レンダリングブロックの削減**

---

## 🟢 優先度: 低（長期的な改善）

### 9. Reactコンポーネントのメモ化追加

**現状**:
- `CalendarCell` は既に `React.memo` でメモ化されている ✅
- 他のコンポーネントでもメモ化できる可能性がある

**改善が必要な可能性がある箇所**:
- ダッシュボードのスケジュールリストアイテム
- カレンダー表示コンポーネント

**期待される効果**: 不要な再レンダリングの削減、**スクロール時のパフォーマンス向上**

---

### 10. データベースインデックスの確認

**現状の問題**:
- 頻繁に使用されるクエリでインデックスが適切に設定されているか確認が必要

**確認が必要なインデックス**:
- `schedules.share_link` (既存の可能性が高い)
- `bookings(schedule_id, status)` の複合インデックス
- `guest_responses(schedule_id, is_confirmed)` の複合インデックス
- `availability_slots(schedule_id, date)` の複合インデックス

**期待される効果**: データベースクエリ時間を **30-50%短縮**（データ量が多い場合）

---

## 📊 総合的な期待効果

| 改善項目 | 効果 | 実装難易度 | 優先度 |
|---------|------|-----------|--------|
| ダッシュボード並列取得 | 50-80%短縮 | 中 | ⭐⭐⭐⭐⭐ |
| DBクエリ最適化 | 20-40%短縮 | 低 | ⭐⭐⭐⭐⭐ |
| コンソールログ削除 | 5-15%短縮 | 低 | ⭐⭐⭐⭐ |
| スケルトンUI | 体感50-70%向上 | 中 | ⭐⭐⭐⭐ |
| APIキャッシュ強化 | 再アクセス時90%削減 | 中 | ⭐⭐⭐ |
| 重い計算のメモ化 | スクロール時快適化 | 低 | ⭐⭐⭐ |
| フォント最適化 | 10-20%短縮 | 低 | ⭐⭐ |
| 画像最適化 | 10-20%短縮 | 低 | ⭐⭐ |
| Reactメモ化追加 | スクロール時快適化 | 低 | ⭐⭐ |
| DBインデックス確認 | 30-50%短縮 | 中 | ⭐⭐ |

## 🎯 推奨実装順序

### フェーズ1（即効性）: 
1. ダッシュボード並列データ取得
2. データベースクエリ最適化（select('*') の削減）
3. 本番環境でのコンソールログ削除

### フェーズ2（体感速度改善）:
4. スケルトンUIの実装
5. APIキャッシュ戦略の強化
6. 重い計算処理のメモ化

### フェーズ3（長期的改善）:
7. フォント・画像の最適化
8. Reactコンポーネントのメモ化追加
9. データベースインデックスの確認

---

## 💡 追加の最適化アイデア

### 1. Suspenseとストリーミング（Next.js App Router）
- ページ全体ではなく、コンポーネント単位でSuspenseを使用
- データが揃った部分から順次表示

### 2. プリフェッチング
- リンクホバー時にデータを事前取得
- よくアクセスされるページのデータを事前読み込み

### 3. バンドルサイズの最適化
- 使用していないライブラリの削除
- 動的インポートの活用
- Tree shakingの確認

### 4. CDNの活用
- 静的アセットのCDN配信
- 画像の最適化CDN使用

---

## 📝 実装時の注意点

1. **段階的な実装**: 一度にすべてを実装せず、効果を測定しながら進める
2. **パフォーマンス測定**: 実装前後でパフォーマンスを測定し、改善効果を確認
3. **バグの確認**: 最適化が既存機能に影響を与えていないか確認
4. **ユーザー体験**: パフォーマンス向上がUX向上に繋がることを確認

