import { z } from 'zod'

/**
 * メールアドレスの検証スキーマ
 */
export const emailSchema = z.string().email('Invalid email format').max(255, 'Email is too long')

/**
 * 日付の検証スキーマ（YYYY-MM-DD形式）
 */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')

/**
 * 時刻の検証スキーマ（HH:MM形式）
 */
export const timeSchema = z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)')

/**
 * ゲスト情報の検証スキーマ
 */
export const guestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  email: emailSchema,
})

/**
 * 予約作成の検証スキーマ
 */
export const bookingSchema = z.object({
  scheduleId: z.string().uuid('Invalid schedule ID'),
  bookingDate: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  guestName: z.string().min(1, 'Guest name is required').max(255, 'Guest name is too long'),
  guestEmail: emailSchema,
  guestUserId: z.string().uuid().optional().nullable(),
  comment: z.string().max(2000, 'Comment is too long').optional().nullable(),
})

/**
 * チームメンバー更新の検証スキーマ
 */
export const updateMemberSchema = z.object({
  membershipId: z.string().uuid('Invalid membership ID'),
  userId: z.string().uuid('Invalid user ID'),
})

/**
 * ゲストプリセット保存の検証スキーマ
 */
export const guestPresetsSchema = z.object({
  scheduleId: z.string().uuid('Invalid schedule ID'),
  guests: z.array(guestSchema).min(1, 'At least one guest is required'),
})

/**
 * イベント削除の検証スキーマ
 */
export const deleteEventSchema = z.object({
  type: z.enum(['booking', 'response'], {
    errorMap: () => ({ message: 'Type must be either "booking" or "response"' }),
  }),
  bookingId: z.string().uuid('Invalid booking ID').optional(),
  responseId: z.string().uuid('Invalid response ID').optional(),
}).refine(
  (data) => {
    if (data.type === 'booking') return !!data.bookingId
    if (data.type === 'response') return !!data.responseId
    return false
  },
  {
    message: 'bookingId is required for type "booking", responseId is required for type "response"',
  }
)

/**
 * トークン検証のスキーマ
 */
export const tokenSchema = z.object({
  token: z.string().uuid('Invalid token format'),
})

/**
 * スケジュールIDの検証スキーマ
 */
export const scheduleIdSchema = z.object({
  scheduleId: z.string().uuid('Invalid schedule ID'),
})

/**
 * バリデーションエラーをフォーマット
 */
export function formatValidationError(error: z.ZodError): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
}
