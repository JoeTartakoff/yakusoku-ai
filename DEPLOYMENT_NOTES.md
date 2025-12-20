# デプロイ関連メモ

## 概要
このドキュメントには、デプロイ時に発生した問題、学んだこと、そして再発防止のためのルーチンが記録されています。

---

## デプロイ失敗事例と解決方法

### 2024年 - Git認証エラー

#### 問題
- **日付**: 2024年（7日表示モード追加時）
- **エラー内容**:
  ```
  fatal: could not read Username for 'https://github.com': Device not configured
  ```
- **発生状況**: 
  - コード変更をコミット後、`git push origin main` を実行
  - HTTPS URLでリモートが設定されていたが、認証情報が設定されていなかった

#### 試行した解決方法
1. **HTTPS認証の試行** → 失敗（認証情報なし）
2. **SSH URLへの変更試行** → 失敗（権限エラー: `Operation not permitted`）
3. **SSH鍵検証** → 失敗（`Host key verification failed`）
4. **認証ヘルパーの設定** → 成功
   ```bash
   git config --global credential.helper osxkeychain
   git config credential.helper store
   ```

#### 最終的な解決方法
```bash
# リモートURLをHTTPSに設定（既に設定済みの場合）
git remote set-url origin https://github.com/JoeTartakoff/yakusoku-ai.git

# 認証ヘルパーを設定
git config --global credential.helper osxkeychain

# プッシュ実行
git push origin main
```

#### 学んだこと
- macOSでは `osxkeychain` を使用して認証情報を管理できる
- サンドボックス環境では `.git/config` への書き込み権限が制限される場合がある
- SSH鍵が設定されていない場合、HTTPS + 認証ヘルパーが確実

---

## デプロイ前チェックリスト

### コード変更時
- [ ] リンターエラーがないか確認 (`npm run lint`)
- [ ] ビルドが成功するか確認 (`npm run build`)
- [ ] ローカルで動作確認
- [ ] デザインルールに準拠しているか確認
- [ ] 変更ファイルを適切にステージング (`git add`)

### コミット時
- [ ] 意味のあるコミットメッセージを記述
- [ ] 不要なファイル（`.env`, `node_modules`など）が含まれていないか確認
- [ ] `.gitignore` が適切に設定されているか確認

### プッシュ前
- [ ] リモートURLが正しいか確認 (`git remote -v`)
- [ ] 認証情報が設定されているか確認
- [ ] プッシュ先ブランチが正しいか確認 (`git branch`)
- [ ] 最新のリモート変更を取得 (`git pull origin main`)

### プッシュ後
- [ ] プッシュが成功したか確認
- [ ] Vercelなどのデプロイプラットフォームでビルドが開始されたか確認
- [ ] デプロイログを確認してエラーがないかチェック
- [ ] 本番環境で動作確認

---

## 再発防止ルーチン

### 1. デプロイ前の自動チェック
以下のスクリプトを実行して、デプロイ前に問題がないか確認する：

```bash
#!/bin/bash
# deploy-check.sh

echo "🔍 リンターチェック..."
npm run lint || exit 1

echo "🔨 ビルドチェック..."
npm run build || exit 1

echo "📦 Git状態確認..."
git status

echo "✅ チェック完了！"
```

### 2. Git認証の事前確認
デプロイ前に認証状態を確認する：

```bash
# リモートURL確認
git remote -v

# 認証ヘルパー確認
git config --global credential.helper

# テストプッシュ（dry-run）
git push --dry-run origin main
```

### 3. デプロイスクリプトの作成
`package.json` にデプロイ用スクリプトを追加：

```json
{
  "scripts": {
    "deploy:check": "npm run lint && npm run build",
    "deploy:push": "git push origin main",
    "deploy": "npm run deploy:check && npm run deploy:push"
  }
}
```

### 4. デプロイ前の必須確認事項
以下のコマンドを実行して、すべて成功することを確認：

```bash
# 1. リンターエラーなし
npm run lint

# 2. ビルド成功
npm run build

# 3. Git状態確認
git status

# 4. リモート確認
git remote -v

# 5. 認証確認（必要に応じて）
git config credential.helper
```

---

## よくある問題と解決方法

### 問題1: Git認証エラー
**症状**: `fatal: could not read Username for 'https://github.com'`

**解決方法**:
```bash
# macOSの場合
git config --global credential.helper osxkeychain

# Linux/Windowsの場合
git config --global credential.helper store
```

### 問題2: SSH鍵検証エラー
**症状**: `Host key verification failed`

**解決方法**:
```bash
# SSH鍵をGitHubに登録するか、HTTPS URLを使用
git remote set-url origin https://github.com/USERNAME/REPO.git
```

### 問題3: 権限エラー
**症状**: `Operation not permitted` または `.git/config` への書き込みエラー

**解決方法**:
- サンドボックス環境の場合は、`required_permissions: ['all']` を使用
- または、手動でターミナルから実行

### 問題4: ビルドエラー
**症状**: Vercelなどでビルドが失敗する

**解決方法**:
1. ローカルで `npm run build` を実行してエラーを確認
2. 環境変数が正しく設定されているか確認
3. 依存関係が正しくインストールされているか確認

---

## デプロイフロー（推奨）

### 標準的なデプロイフロー

```bash
# 1. 変更を確認
git status

# 2. 変更をステージング
git add <変更ファイル>

# 3. コミット
git commit -m "変更内容の説明"

# 4. リモートの最新を取得
git pull origin main

# 5. プッシュ
git push origin main

# 6. デプロイプラットフォームで確認
# (Vercelの場合は自動デプロイが開始される)
```

### 緊急時のデプロイフロー

問題が発生した場合：

1. **エラーメッセージを記録**
2. **このドキュメントを参照**
3. **解決方法を試行**
4. **解決した場合は、このドキュメントに追記**

---

## デプロイ環境情報

- **リポジトリ**: https://github.com/JoeTartakoff/yakusoku-ai.git
- **デプロイプラットフォーム**: Vercel（推測）
- **ブランチ**: `main`
- **認証方法**: HTTPS + osxkeychain

---

## 更新履歴

- **2024年**: 初版作成（Git認証エラーの記録と解決方法）

---

## 注意事項

- このドキュメントは、デプロイ時に発生した問題とその解決方法を記録するために作成されました
- 新しい問題が発生した場合は、必ずこのドキュメントに追記してください
- 定期的にこのドキュメントを確認し、デプロイ前のチェックリストを実行してください
