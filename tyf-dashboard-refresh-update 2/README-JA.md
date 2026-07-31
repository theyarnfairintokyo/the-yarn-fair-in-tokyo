# ダッシュボード刷新ファイル — THE YARN FAIR IN TOKYO™

既存の `the-yarn-fair-in-tokyo` リポジトリに上書き・追加する更新ファイルです。

## 更新内容

- PLUM専用管理画面レイアウト
- リアルタイムダッシュボード
- 本日のチェックイン数
- 総登録者／受付済み／未来場者
- 来場予定日別グラフ
- 最新チェックイン一覧
- 業種ランキング
- 来場者検索
- 受付状態・来場日絞り込み
- CSV／Excel出力
- Supabase Realtime更新
- 既存のSupabase AuthとExhibitor CMSを維持
- PC／iPad／スマートフォン対応

## GitHubへ反映するファイル

リポジトリ直下の同じ場所へアップロードしてください。

- `admin.html`：既存ファイルを置換
- `public/css/admin-dashboard.css`：新規追加
- `src/admin-dashboard.js`：新規追加

既存の次のファイルは削除・変更しません。

- `src/staff.js`
- `src/cms.js`
- `src/supabase.js`
- `public/css/style.css`
- Supabase SQL
- Netlify Functions

`admin.html` では管理画面用に `src/staff.js` を読み込まず、新しい
`src/admin-dashboard.js` を読み込みます。スタッフログインとQR受付は引き続き
既存の `src/staff.js` を利用します。

## GitHubブラウザでのアップロード

1. ZIPを解凍します。
2. GitHubのリポジトリを開きます。
3. `Add file` → `Upload files` を選択します。
4. 解凍後の3ファイルを、フォルダ構造を保ったままアップロードします。
5. 既存 `admin.html` の置換を確認します。
6. Commit message：
   `Refresh admin dashboard with PLUM operations UI`
7. `Commit changes` を押します。
8. Netlifyの自動デプロイ完了後、`/admin.html` を確認します。

## 確認項目

- 管理者ログイン後にDashboardが表示される
- 数字がSupabaseの実データと一致する
- Visitors検索・絞り込みが動く
- QR CHECK-INへ移動できる
- EXHIBITOR CMSが管理者だけに表示される
- CSV／Excelがダウンロードできる
- iPadとiPhoneで画面が崩れない

## 注意

現在のDB構造に合わせ、次の既存テーブル／列を利用します。

- `staff_profiles`
- `registrations`
- `visitors`
- `checkins`
- `registrations.planned_visit_dates`
- `visitors.full_name`
- `visitors.company_name`
- `visitors.email`
- `visitors.phone`
- `visitors.industry`

Supabase Realtimeが無効でも画面は動作します。その場合、右上の更新ボタンで再読み込みできます。
