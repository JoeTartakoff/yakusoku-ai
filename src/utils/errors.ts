/**
 * 統一的なエラーハンドリングユーティリティ
 * 本番環境では機密情報を隠し、開発環境では詳細情報を提供
 */

export interface ApiError {
  message: string
  code?: string
  statusCode: number
}

/**
 * エラーを安全な形式に変換
 */
export function sanitizeError(error: unknown): ApiError {
  const isProduction = process.env.NODE_ENV === 'production'

  if (error instanceof Error) {
    // 本番環境では詳細情報を隠す
    if (isProduction) {
      return {
        message: 'An error occurred. Please try again later.',
        statusCode: 500,
      }
    }

    // 開発環境では詳細情報を提供
    return {
      message: error.message,
      statusCode: 500,
    }
  }

  // 不明なエラー
  return {
    message: isProduction
      ? 'An unexpected error occurred.'
      : String(error),
    statusCode: 500,
  }
}

/**
 * APIエラーレスポンスを作成
 */
export function createErrorResponse(
  error: unknown,
  statusCode: number = 500
): Response {
  const sanitized = sanitizeError(error)
  
  // 本番環境ではスタックトレースをログに記録（クライアントには返さない）
  if (process.env.NODE_ENV === 'production' && error instanceof Error) {
    console.error('API Error:', {
      message: error.message,
      stack: error.stack,
      // 機密情報は含めない
    })
  } else if (error instanceof Error) {
    console.error('API Error:', error)
  }

  return Response.json(
    {
      success: false,
      error: sanitized.message,
      ...(process.env.NODE_ENV !== 'production' && error instanceof Error && {
        details: error.stack,
      }),
    },
    { status: statusCode }
  )
}

/**
 * バリデーションエラーの作成
 */
export function createValidationError(message: string): Response {
  return Response.json(
    {
      success: false,
      error: message,
    },
    { status: 400 }
  )
}
