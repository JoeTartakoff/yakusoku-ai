# デザインルール

## カラースキーム

### 予約モード別の色分け
- **通常予約モード**: 青（`blue`）
  - プライマリ: `bg-blue-600` / `hover:bg-blue-700`
  - セカンダリ: `bg-blue-50` / `text-blue-700` / `border-blue-300`
  - バッジ: `bg-blue-100` / `text-blue-800`

- **候補時間モード（Candidate Mode）**: 紫（`purple`）
  - プライマリ: `bg-purple-600` / `hover:bg-purple-700`
  - セカンダリ: `bg-purple-50` / `text-purple-700` / `border-purple-300`
  - バッジ: `bg-purple-100` / `text-purple-800`

- **候補日受取モード（Interview Mode）**: オレンジ（`orange`）
  - プライマリ: `bg-orange-600` / `hover:bg-orange-700`
  - セカンダリ: `bg-orange-50` / `text-orange-700` / `border-orange-300`
  - バッジ: `bg-orange-100` / `text-orange-800`

### 機能別の色
- **削除・キャンセル**: 赤（`red`）
  - ボタン: `border-red-300` / `text-red-700` / `bg-white` / `hover:bg-red-50`
  - アイコン: `bg-red-500` / `hover:bg-red-600`

- **成功・確認**: 緑（`green`）
  - 背景: `bg-green-50` / `bg-green-100`
  - テキスト: `text-green-800`
  - ボーダー: `border-green-200`

- **警告・ワンタイムリンク**: 黄（`yellow`）
  - ボタン: `border-yellow-300` / `bg-yellow-50` / `text-yellow-700` / `hover:bg-yellow-100`

### ベースカラー
- **背景**: `bg-gray-50`（ページ背景）、`bg-white`（カード背景）
- **テキスト**: `text-gray-900`（見出し）、`text-gray-700`（本文）、`text-gray-600`（サブテキスト）、`text-gray-500`（補助テキスト）
- **ボーダー**: `border-gray-300`（デフォルト）、`border-gray-200`（軽いボーダー）

### テーマカラー
- **プライマリテーマ**: `#3b82f6` (blue-600)
- **テーマカラー設定**: `themeColor: '#3b82f6'` (layout.tsx, manifest.json)

## タイポグラフィ

### フォント
- **メインフォント**: Noto Sans JP
  - ウェイト: 400, 500, 600, 700
  - CSS変数: `--font-noto-sans-jp`
  - 全ページで最優先に設定

### フォントサイズ
- **見出し**: `text-4xl`（h1）、`text-3xl`（h2）、`text-2xl`（h2）、`text-xl`（h3）
- **本文**: `text-sm`（ボタン・ラベル）、`text-base`（デフォルト）
- **補助テキスト**: `text-xs`

### フォントウェイト
- **太字**: `font-bold`（見出し）、`font-medium`（ボタン・ラベル）、`font-semibold`（ナビゲーション）

## ボタンスタイル

### プライマリボタン
```css
bg-{color}-600 hover:bg-{color}-700 text-white font-medium py-2/3 px-4 rounded-md
```
- 例: `bg-blue-600 hover:bg-blue-700`

### セカンダリボタン（アウトライン）
```css
border border-{color}-300 bg-{color}-50 text-{color}-700 hover:bg-{color}-100
```
- 例: `border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100`

### グレーボタン（デフォルト）
```css
border border-gray-300 bg-white text-gray-700 hover:bg-gray-50
```

### 削除ボタン
```css
border border-red-300 bg-white text-red-700 hover:bg-red-50
```

### アイコンボタン（削除）
```css
bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6
```

### フローティングアクションボタン（FAB）
```css
bg-{color}-600 hover:bg-{color}-700 text-white font-medium py-4 px-6 rounded-full shadow-lg transition-all hover:scale-105
```

## スペーシング

### 角丸（Border Radius）
- **小**: `rounded-md` (8px) - ボタン、入力フィールド
- **中**: `rounded-lg` (12px) - カード、モーダル
- **大**: `rounded-full` - アイコンボタン、FAB

### パディング
- **ボタン**: `py-2 px-3`（小）、`py-3 px-4`（中）、`py-4 px-6`（大）
- **カード**: `p-4`、`p-6`、`p-8`
- **入力フィールド**: `py-2 px-3`

### マージン・ギャップ
- **コンテナ間**: `space-y-4`、`space-y-6`、`space-y-8`
- **グリッド**: `gap-2`、`gap-3`、`gap-4`

## シャドウ

- **小**: `shadow-sm` - ボタン、入力フィールド
- **中**: `shadow` - カード
- **大**: `shadow-lg` - モーダル、重要カード
- **特大**: `shadow-xl` - ポップアップ

## トランジション・アニメーション

- **カラー変更**: `transition-colors`
- **全プロパティ**: `transition-all`
- **ホバーエフェクト**: `hover:scale-105`（FAB）
- **スライドアニメーション**: `.animate-slide-down`（トースト）
- **スピナー**: `animate-spin`（ローディング）

## インタラクティブ要素

### カーソル
- **クリック可能な要素**: `cursor: pointer`（グローバルCSSで設定）
  - `button`, `a`, `[role="button"]`, `label[for]`

### フォーカス
- **フォーカスリング**: `focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-{color}-500`
- 例: `focus:ring-blue-500`

### 無効状態
- **disabled**: `disabled:bg-gray-400` / `disabled:opacity-50 disabled:cursor-not-allowed`

## レイアウト

### コンテナ
- **最大幅**: `max-w-md`（小）、`max-w-3xl`（中）、`max-w-7xl`（大）
- **中央揃え**: `mx-auto`
- **レスポンシブ**: `px-4 sm:px-6 lg:px-8`

### グリッド
- **カラム**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- **フレックス**: `flex items-center justify-between`

## バッジ・タグ

```css
inline-flex items-center px-2/3 py-1 rounded-full text-xs/text-sm font-medium bg-{color}-100 text-{color}-800
```

## カード

```css
bg-white shadow rounded-lg p-4/p-6
```

## モーダル・ポップアップ

```css
fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50
bg-white rounded-lg p-6 max-w-md w-full mx-4
```

## 週末の表示

- **週末セル**: `bg-orange-50`（カレンダー表示時）

## レスポンシブデザイン

- **モバイルファースト**: 基本スタイルはモバイル用、`sm:`、`lg:`で拡張
- **サイドバー**: `fixed lg:static`、`w-64`（デスクトップで常時表示）
- **ハンバーガーメニュー**: `lg:hidden`（モバイルのみ表示）

## その他

- **背景グラデーション**: `bg-gradient-to-br from-blue-50 to-indigo-100`（ホームページ）
- **Z-index階層**: `z-40`（オーバーレイ）、`z-50`（モーダル）、`z-[9999]`（トースト）
