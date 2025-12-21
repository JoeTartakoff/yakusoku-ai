# ログ確認ガイド

## 📋 目次
1. [Vercelダッシュボードでのログ確認方法](#vercelダッシュボードでのログ確認方法)
2. [Vercel CLIでのログ確認方法](#vercel-cliでのログ確認方法)
3. [ログで確認すべき情報](#ログで確認すべき情報)
4. [ローカル環境でのログ確認](#ローカル環境でのログ確認)

---

## 1. Vercelダッシュボードでのログ確認方法

### ステップ1: Vercelにログイン
1. ブラウザで [https://vercel.com](https://vercel.com) にアクセス
2. GitHubアカウントでログイン（プロジェクトがGitHubと連携している場合）

### ステップ2: プロジェクトを選択
1. ダッシュボードから **「yakusoku-ai」** プロジェクトをクリック
2. プロジェクトの詳細ページが開きます

### ステップ3: ログを確認
以下の2つの方法があります：

#### 方法A: デプロイメント履歴から確認（推奨）
1. プロジェクトページの上部にある **「Deployments」** タブをクリック
2. 最新のデプロイメント（一番上）をクリック
3. デプロイメント詳細ページが開きます
4. ページ下部の **「Functions」** セクションを探す
5. **「View Function Logs」** または **「Logs」** ボタンをクリック
6. ログが表示されます

#### 方法B: リアルタイムログを確認
1. プロジェクトページの左サイドバーから **「Logs」** をクリック
2. リアルタイムでログが表示されます
3. フィルター機能で特定のログを検索可能

### ステップ4: メール送信関連のログを検索
ログ画面で以下のキーワードで検索：
- `📧` (メール送信関連のログ)
- `SENDGRID` (SendGrid関連)
- `Failed to send` (エラーログ)
- `add-event` (APIエンドポイント名)

---

## 2. Vercel CLIでのログ確認方法

### ステップ1: Vercel CLIをインストール（未インストールの場合）
```bash
npm i -g vercel
```

### ステップ2: Vercelにログイン
```bash
vercel login
```
ブラウザが開き、認証が完了します。

### ステップ3: プロジェクトをリンク（初回のみ）
```bash
cd /Users/tomohironozaki/Library/CloudStorage/GoogleDrive-t.nozaki@logo-labo.com/共有ドライブ/dev_project/yakusoku-ai-app/yakusoku-ai
vercel link
```

### ステップ4: ログを確認
```bash
# リアルタイムログを表示
vercel logs

# 特定の関数のログを表示
vercel logs --follow

# 最新の100件のログを表示
vercel logs --limit 100

# メール送信関連のログをフィルター
vercel logs | grep "📧"
```

---

## 3. ログで確認すべき情報

### ✅ 正常に動作している場合のログ例
```
📧 Starting email notification process...
📧 Environment check: {
  hasSendGridApiKey: true,
  hasSendGridFromEmail: true,
  hasSendGridFromName: true
}
📧 === SENDING BOOKING NOTIFICATIONS ===
📧 Email configuration check: {
  hasApiKey: true,
  hasFromEmail: true,
  hasFromName: true,
  fromEmail: "noreply@example.com",
  fromName: "Yakusoku-AI"
}
📧 Attempting to send host notification email...
✅ Host notification email sent successfully
📧 Attempting to send guest confirmation email...
✅ Guest confirmation email sent successfully
📧 Host email: ✅ Sent
📧 Guest email: ✅ Sent
✅ All emails sent successfully
```

### ❌ エラーが発生している場合のログ例

#### パターン1: 環境変数が設定されていない
```
❌ SENDGRID_API_KEY is not set in environment variables
📧 Environment check: {
  hasSendGridApiKey: false,
  hasSendGridFromEmail: false,
  hasSendGridFromName: false
}
❌ Failed to send host notification email: SENDGRID_API_KEY is not set
```

#### パターン2: SendGrid APIエラー
```
❌ Failed to send host notification email: {
  errorType: "Error",
  errorMessage: "SendGrid API error: Status 401",
  statusCode: 401,
  hasApiKey: true,
  hasFromEmail: true,
  hasFromName: true
}
```

#### パターン3: メール送信処理が実行されていない
```
（メール送信関連のログが一切表示されない）
```

### 🔍 確認すべきポイント

1. **メール送信処理が実行されているか**
   - `📧 Starting email notification process...` というログがあるか

2. **環境変数が設定されているか**
   - `hasSendGridApiKey: true` になっているか
   - `hasSendGridFromEmail: true` になっているか

3. **SendGrid APIエラーの詳細**
   - `statusCode` の値（401 = 認証エラー、403 = 権限エラー、400 = リクエストエラー）
   - `errorMessage` の内容

4. **どのメールが失敗したか**
   - `hostEmailFailed: true` → ホスト通知メールが失敗
   - `guestEmailFailed: true` → ゲスト確認メールが失敗

---

## 4. ローカル環境でのログ確認

### 開発サーバーを起動
```bash
npm run dev
```

### ログの確認
ターミナルに直接ログが表示されます。

### テスト用のメール送信APIを呼び出す
```bash
# テスト用エンドポイント（開発環境のみ）
curl http://localhost:3000/api/test-email
```

---

## 5. 環境変数の確認方法

### Vercelダッシュボードで確認
1. プロジェクトページを開く
2. 左サイドバーから **「Settings」** をクリック
3. **「Environment Variables」** をクリック
4. 以下の環境変数が設定されているか確認：
   - `SENDGRID_API_KEY`
   - `SENDGRID_FROM_EMAIL`
   - `SENDGRID_FROM_NAME`

### Vercel CLIで確認
```bash
vercel env ls
```

---

## 6. トラブルシューティング

### ログが表示されない場合
1. **デプロイが完了しているか確認**
   - Vercelダッシュボードで最新のデプロイメントが成功しているか確認

2. **ログの表示期間を確認**
   - Vercelのログは一定期間（通常24時間）のみ保存されます
   - 古いログは表示されない可能性があります

3. **フィルターを解除**
   - ログ画面のフィルター設定を確認し、すべてのログを表示するように設定

### メール送信処理のログが見つからない場合
1. **APIエンドポイントが呼び出されているか確認**
   - `/api/calendar/add-event` へのリクエストログを確認
   - リクエストが到達しているか確認

2. **エラーで処理が中断されていないか確認**
   - カレンダーイベント作成のエラーログを確認
   - メール送信処理に到達する前にエラーが発生している可能性

---

## 7. ログのスクリーンショットを取得する方法

問題が発生した場合、以下の情報を含めてスクリーンショットを取得してください：

1. **ログの全体**（タイムスタンプを含む）
2. **エラーメッセージの詳細**
3. **環境変数の設定状況**（機密情報は隠す）
4. **デプロイメントの情報**（デプロイ時刻、コミットハッシュ）

---

## 8. よくあるエラーと対処法

### エラー: `SENDGRID_API_KEY is not set`
**原因**: 環境変数が設定されていない  
**対処**: Vercelダッシュボードで環境変数を設定し、再デプロイ

### エラー: `SendGrid API error: Status 401`
**原因**: APIキーが無効または期限切れ  
**対処**: SendGridダッシュボードで新しいAPIキーを生成し、環境変数を更新

### エラー: `SendGrid API error: Status 403`
**原因**: 送信者メールアドレスが認証されていない  
**対処**: SendGridダッシュボードで送信者メールアドレスを認証

### エラー: `SendGrid API error: Status 400`
**原因**: リクエストの形式が不正  
**対処**: ログの詳細を確認し、問題のあるフィールドを特定

---

## 9. サポートが必要な場合

ログを確認しても問題が解決しない場合、以下の情報を共有してください：

1. **エラーログの全文**（機密情報を除く）
2. **環境変数の設定状況**（値は隠す）
3. **発生時刻**
4. **再現手順**
