# Supabase マイグレーション手順

## 概要
予約フォームにコメント機能を追加するため、`bookings`テーブルに`comment`カラムを追加する必要があります。

## 作業内容

### 1. Supabase Dashboard にアクセス
1. [Supabase Dashboard](https://app.supabase.com/) にログイン
2. 該当プロジェクトを選択

### 2. SQL Editor でマイグレーション実行

SQL Editorを開き、以下のSQLを実行してください：

```sql
-- bookingsテーブルにcommentカラムを追加
ALTER TABLE bookings 
ADD COLUMN comment TEXT NULL;

-- コメントを表示しやすいようにコメントを追加（オプション）
COMMENT ON COLUMN bookings.comment IS '予約時のゲストからのコメント（任意入力）';
```

### 3. 確認

マイグレーション後、以下を確認してください：

1. **Table Editor**で`bookings`テーブルを開く
2. `comment`カラムが追加されていることを確認
3. 型が`text`で、NULL許可になっていることを確認

### 4. 既存データの確認（任意）

既存の予約データがある場合、`comment`カラムは自動的に`NULL`になります。これは問題ありません。

## 注意事項

- このマイグレーションは**非破壊的**です（既存データに影響しません）
- `comment`カラムはNULL許可なので、既存の予約レコードには影響しません
- 新しい予約のみ、コメントが保存されます

## 完了後の確認

マイグレーション完了後、以下をテストしてください：

1. 予約フォームを開く
2. コメントフィールドに入力する
3. 予約を確定する
4. データベースの`bookings`テーブルで、`comment`カラムに値が保存されていることを確認



