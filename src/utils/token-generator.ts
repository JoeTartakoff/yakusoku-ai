/**
 * 短いワンタイムトークン生成ユーティリティ
 * 
 * URLに埋め込みやすい短いランダム文字列を生成します
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const TOKEN_LENGTH = 10 // 10文字で約62^10 = 839,299,365,868,340,224 通り

/**
 * 短いランダムトークンを生成
 * 10文字の英数字で約62^10通りの組み合わせ
 */
export function generateShortToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH)
  crypto.getRandomValues(array)
  
  let token = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += CHARS[array[i] % CHARS.length]
  }
  
  return token
}
