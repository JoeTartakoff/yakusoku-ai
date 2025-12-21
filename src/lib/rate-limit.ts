/**
 * シンプルなインメモリレート制限
 * 本番環境ではRedisなどの外部ストレージを使用することを推奨
 */

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

/**
 * レート制限をチェック
 * @param identifier リクエストを識別するキー（IPアドレス、ユーザーIDなど）
 * @param limit 時間あたりのリクエスト数
 * @param windowMs 時間窓（ミリ秒）
 * @returns レート制限を超えている場合はtrue
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60000 // デフォルト: 1分間
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const key = identifier

  // 既存のレコードを取得
  const record = store[key]

  // レコードが存在しない、またはリセット時間を過ぎている場合
  if (!record || now > record.resetTime) {
    store[key] = {
      count: 1,
      resetTime: now + windowMs,
    }
    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: now + windowMs,
    }
  }

  // レート制限を超えている場合
  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }

  // カウントを増やす
  record.count++
  return {
    allowed: true,
    remaining: limit - record.count,
    resetTime: record.resetTime,
  }
}

/**
 * 古いレコードをクリーンアップ（定期的に実行）
 */
export function cleanupRateLimitStore() {
  const now = Date.now()
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  })
}

// 5分ごとにクリーンアップを実行
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000)
}

/**
 * リクエストから識別子を取得
 */
export function getRateLimitIdentifier(request: Request): string {
  // IPアドレスを取得（Vercelの場合）
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown'

  return ip
}
