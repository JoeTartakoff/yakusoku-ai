/**
 * アポ調整URL生成ユーティリティ
 * 
 * 各種予約・候補時間提示・インタビューモードのURLを統一的な方法で生成します。
 */

export interface GuestInfo {
  name?: string
  email?: string
}

export interface BookingUrlOptions {
  shareLink: string
  guestInfo?: GuestInfo
  token?: string
  guestToken?: string
  baseUrl?: string
}

export interface CandidateUrlOptions {
  shareLink: string
  guestInfo?: GuestInfo
  baseUrl?: string
}

export interface InterviewUrlOptions {
  shareLink: string
  guestInfo?: GuestInfo
  baseUrl?: string
}

/**
 * ベースURLを取得
 */
function getBaseUrl(baseUrl?: string): string {
  if (baseUrl) return baseUrl
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/**
 * ゲスト情報をURLエンコードする
 */
function encodeGuestInfo(guestInfo: GuestInfo): { encodedName: string; encodedEmail: string } {
  return {
    encodedName: encodeURIComponent(guestInfo.name || ''),
    encodedEmail: encodeURIComponent(guestInfo.email || ''),
  }
}

/**
 * 通常予約リンクを生成
 * 
 * パターン:
 * - ゲスト情報なし: /book/{shareLink}
 * - ゲスト情報あり（パス形式）: /book/{shareLink}/{encodedName}/{encodedEmail}
 * - ゲスト情報あり（クエリ形式）: /book/{shareLink}?name={name}&email={email} (未使用、互換性のため残す)
 * - トークンあり: /book/{shareLink}?token={token} または /book/{shareLink}/{name}/{email}?token={token}
 * - ゲストトークンあり: /book/{shareLink}?guest={guestToken}
 */
export function generateBookingUrl(options: BookingUrlOptions): string {
  const baseUrl = getBaseUrl(options.baseUrl)
  const { shareLink, guestInfo, token, guestToken } = options

  // ゲストトークンがある場合（個人用リンク）
  if (guestToken) {
    return `${baseUrl}/book/${shareLink}?guest=${guestToken}`
  }

  // ゲスト情報がパス形式で含まれる場合
  if (guestInfo?.name && guestInfo?.email) {
    const { encodedName, encodedEmail } = encodeGuestInfo(guestInfo)
    const pathSegment = `${shareLink}/${encodedName}/${encodedEmail}`
    
    if (token) {
      return `${baseUrl}/book/${pathSegment}?token=${token}`
    }
    return `${baseUrl}/book/${pathSegment}`
  }

  // トークンのみの場合
  if (token) {
    return `${baseUrl}/book/${shareLink}?token=${token}`
  }

  // 基本URL
  return `${baseUrl}/book/${shareLink}`
}

/**
 * 候補時間提示リンクを生成（候補モード）
 * 
 * パターン:
 * - ゲスト情報なし: /candidate/{shareLink}
 * - ゲスト情報あり: /candidate/{shareLink}?name={encodedName}&email={encodedEmail}
 */
export function generateCandidateUrl(options: CandidateUrlOptions): string {
  const baseUrl = getBaseUrl(options.baseUrl)
  const { shareLink, guestInfo } = options

  if (guestInfo?.name && guestInfo?.email) {
    const { encodedName, encodedEmail } = encodeGuestInfo(guestInfo)
    return `${baseUrl}/candidate/${shareLink}?name=${encodedName}&email=${encodedEmail}`
  }

  return `${baseUrl}/candidate/${shareLink}`
}

/**
 * 候補日受取リンクを生成（インタビューモード）
 * 
 * パターン:
 * - ゲスト情報なし: /interview/{shareLink}
 * - ゲスト情報あり: /interview/{shareLink}?name={encodedName}&email={encodedEmail}
 */
export function generateInterviewUrl(options: InterviewUrlOptions): string {
  const baseUrl = getBaseUrl(options.baseUrl)
  const { shareLink, guestInfo } = options

  if (guestInfo?.name && guestInfo?.email) {
    const { encodedName, encodedEmail } = encodeGuestInfo(guestInfo)
    return `${baseUrl}/interview/${shareLink}?name=${encodedName}&email=${encodedEmail}`
  }

  return `${baseUrl}/interview/${shareLink}`
}

/**
 * 固定リンクを生成（スケジュールモードに応じて適切なURLを返す）
 */
export function generateFixedLink(
  shareLink: string,
  options: {
    isCandidateMode: boolean
    isInterviewMode: boolean
    guestInfo?: GuestInfo
    baseUrl?: string
  }
): string {
  const { isCandidateMode, isInterviewMode, guestInfo, baseUrl } = options

  if (isInterviewMode) {
    return generateInterviewUrl({ shareLink, guestInfo, baseUrl })
  }

  if (isCandidateMode) {
    return generateCandidateUrl({ shareLink, guestInfo, baseUrl })
  }

  return generateBookingUrl({ shareLink, guestInfo, baseUrl })
}

/**
 * ワンタイムリンクURLを生成（短いトークンを使用）
 * 
 * パターン: 
 * - ゲスト情報なし: /ot/{token}
 * - ゲスト情報あり: /ot/{token}?name={encodedName}&email={encodedEmail}
 * 元のURL（shareLink）を完全に隠す
 */
export function generateOneTimeUrl(
  token: string,
  options?: { guestInfo?: GuestInfo; baseUrl?: string }
): string {
  const base = getBaseUrl(options?.baseUrl)
  let url = `${base}/ot/${token}`
  
  // ゲスト情報がある場合、クエリパラメータとして追加
  if (options?.guestInfo?.name && options?.guestInfo?.email) {
    const { encodedName, encodedEmail } = encodeGuestInfo(options.guestInfo)
    url += `?name=${encodedName}&email=${encodedEmail}`
  }
  
  return url
}

/**
 * HTML埋め込み用URLを生成（通常予約のみ）
 * 
 * パターン: /book/{shareLink}?embed=true
 * ゲスト情報なしのURLのみ生成します。
 * 
 * @param shareLink - スケジュールの共有リンク
 * @param baseUrl - ベースURL（省略時は現在のオリジン）
 * @returns HTML埋め込み用のURL
 */
export function generateEmbedUrl(shareLink: string, baseUrl?: string): string {
  const base = getBaseUrl(baseUrl)
  return `${base}/book/${shareLink}?embed=true`
}

/**
 * HTML埋め込み用のiframeタグコードを生成
 * 
 * TimeRexスタイルのコメント付きでiframeタグのHTMLコードを生成します。
 * 
 * @param shareLink - スケジュールの共有リンク
 * @param options - オプション（width, height, baseUrl）
 * @returns iframeタグのHTMLコード
 */
export function generateEmbedHtml(
  shareLink: string,
  options?: {
    width?: string
    height?: string
    baseUrl?: string
  }
): string {
  const url = generateEmbedUrl(shareLink, options?.baseUrl)
  const width = options?.width || '100%'
  const height = options?.height || '900px'
  
  return `<!-- Begin YAKUSOKU AI Widget -->
<iframe src="${url}" width="${width}" height="${height}" style="border: none;" allowfullscreen></iframe>
<!-- End YAKUSOKU AI Widget -->`
}
