# OpenAI API コスト制御設計

> 上長確認用資料 / 作成日: 2026-06-22

営業・事業部からのJira依頼レビューにOpenAI APIを利用するにあたり、コストが想定外に増加しないよう、複数の層で利用回数・入力量・対象範囲を制限している。本ドキュメントはその制御点と、最悪ケースのコスト試算を整理する。

## 1. 結論

- **呼び出しは「JPREQ projectでissueが新規作成された瞬間」+「パネルから明示的に再レビュー」した時のみ**。一般ユーザーが任意のタイミングで叩けるエンドポイントは存在しない。
- **対象プロジェクトは `ALLOWED_PROJECT_KEYS` で明示的にホワイトリスト**。それ以外のprojectでは Forge trigger が発火しても OpenAI を呼ばずに早期 return する。
- **`OPENAI_API_KEY` が未設定 / API が失敗した場合は、ルールベースのレビューに自動フォールバック**。API障害がコスト爆発要因に転化しない。
- **OpenAI ダッシュボード側で月次ハード上限を設定する運用とセット**で、技術的制御 + 契約的制御の二重化を推奨する。

## 2. 呼び出し経路ごとの制御

呼び出し経路は3系統あるが、いずれも以下の制御を通る。

| 経路 | トリガ | コスト制御点 |
|------|--------|--------------|
| Forge Trigger（本命） | `avi:jira:created:issue` イベント | (1) project filter, (2) Forge invocation quota |
| Forge Issue Panel | ユーザーが「再レビュー」「コメント投稿」ボタン押下 | (1) project filter, (2) ユーザー操作必須 |
| Webhook / CLI（保険） | Jira Automation または GitHub Actions | (1) project filter, (2) `WEBHOOK_SHARED_SECRET`, (3) Actions実行回数 |

### 2.1 project filter（最上流の遮断）

`src/core/project-filter.js` の `isAllowedIssueKey()` で issue key の prefix を検査する。`ALLOWED_PROJECT_KEYS` 環境変数（既定: `JPREQ`）にマッチしない issue は、OpenAI を呼ぶ前に skip する。

```text
issue created
  └─> Forge trigger 起動
        └─> ALLOWED_PROJECT_KEYS に一致するか？
              ├─ NO  ─> 何もしない（OpenAI 呼ばない）
              └─ YES ─> review pipeline 続行
```

これにより、社内のJira全projectの起票数ではなく **JPREQ project の起票数** がコスト上限になる。

### 2.2 1 issue あたりの呼び出し回数

- 起票時の自動レビュー: **1回**
- パネルからの「再レビュー」: ユーザー1クリックにつき1回（クリックしない限り0回）
- パネルからの「コメント投稿」: 1回
- **上限: 同一 issue に対する AI レビューは 1 日あたり最大 5 回まで**（自動レビュー + 手動再レビューの合算）。上限到達後は OpenAI を呼ばずに「本日の再レビュー上限に達しました」を返す
  - カウンタは Forge storage に `issueKey + YYYY-MM-DD` キーで保持し、日次でリセット
  - 上限値は Forge variable `MAX_REVIEWS_PER_ISSUE_PER_DAY`（既定: 5）で調整可能

通常運用では1 issue = 1〜2 call。レビューUIを開いてもボタンを押さない限り追加課金は発生しない。

### 2.3 入力サイズの上限

OpenAI に渡すペイロードは固定スキーマで、ユーザー入力をそのまま流し込まない:

```js
{
  issue: { key, summary, description, priority, dueDate, attachmentCount, issueLinkCount },
  ruleReview: { verdict, reason, missingItems }
}
```

- 添付ファイル本体・コメント履歴・画像は送らない（メタ情報のカウントのみ）
- **`description` の上限は 8,000 文字**（Forge variable `MAX_DESCRIPTION_CHARS`、既定: 8000、許容範囲 4,000〜8,000）。超過時は先頭 8,000 文字のみを OpenAI に送信し、レビューコメント末尾に
  > ⚠️ 本 issue の description が上限（8,000 文字）を超えたため、先頭部分のみ AI レビュー対象です。
  
  を明記する
- Jira の summary / description は実質ユーザー記述分のみ。営業の起票が極端に長くなることは運用上ほぼなく、Jira の description 上限（32KB）を超えることはない
- 上記 `MAX_DESCRIPTION_CHARS` による追加ガードを既定で有効化する（後述「追加検討」参照）

### 2.4 モデル選択

`OPENAI_MODEL` 環境変数で切替可能（既定: `gpt-5.2`）。高負荷時・コスト懸念時に Forge variables を変更するだけで mini系モデルへ即時切替できる。コードデプロイ不要。

### 2.5 自動フォールバック

`OPENAI_API_KEY` 未設定、または OpenAI API が non-2xx を返した場合、`src/core/review.js` がルールベースの質問・改善案を返す。

- API障害時に retry ループに入らない（1 issue = OpenAI call 最大1回）
- API key を一時的に外せば、コードを変更せずに**全コール停止**できる（kill switch）

## 3. Forge プラットフォーム側の制限

Forge 自体にも quota があり、暴走時の二次的なセーフティネットとして機能する。

- 1 invocation あたり実行時間 25 秒
- 1日あたりの invocation 数・データ転送量に Atlassian 側のソフトリミット
- external egress は manifest で `https://api.openai.com` のみ許可（他ホストへは出ない）

## 4. 想定コスト試算（実測トークンベース）

### 4.1 計算根拠

`src/core/openai-review.js` で実際に送る prompt をベースに、GPT-4o系のトークナイザ (`gpt-tokenizer`, o200k_base) で計測した結果:

| サンプル | 入力 tokens (instructions含む) | 出力 tokens | 備考 |
|---------|-------------------------------|-------------|------|
| Small  | 201 | 150 | 短い不具合報告 (description ~20文字) |
| Medium | 360 | 300 | 典型的な機能依頼 (description ~200文字) |
| Large  | 1,123 | 600 | 長文化した依頼 (description ~1,500文字) |

固定 instructions は 122 tokens、出力スキーマは JSON で上限 600 tokens 程度に収束する（schema 上 `questions[]` と `improvedDescription` の長さで頭打ち）。

### 4.2 単価 (2026年6月時点・OpenAI公開価格)

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------:|--------------:|
| gpt-5.2 (現行設定) | $1.75 | $14.00 |
| gpt-5.2-mini | $0.25 | $2.00 |
| gpt-5-nano | $0.05 | $0.40 |

参考レート: 1 USD ≈ ¥150

### 4.3 1 call あたりの実測コスト

```
コスト = (input_tokens × input_unit + output_tokens × output_unit) / 1,000,000
```

| サンプル | gpt-5.2 | gpt-5.2-mini |
|---------|--------:|-------------:|
| Small  | $0.0025 (¥0.37) | $0.00035 (¥0.05) |
| Medium | $0.0048 (¥0.72) | $0.00069 (¥0.10) |
| Large  | $0.0104 (¥1.56) | $0.00148 (¥0.22) |

### 4.4 月次コスト想定

前提:
- 1 issue あたり平均 1.5 call (自動レビュー1回 + 50% のチケットで再レビュー/再投稿が1回)
- すべて Medium サイズと仮定

| 月間 JPREQ 起票数 | call回数 | gpt-5.2 月額 | gpt-5.2-mini 月額 |
|------------------:|--------:|-------------:|------------------:|
|   50 |   75 | $0.36 (¥54) | $0.05 (¥8) |
|  100 |  150 | $0.72 (¥108) | $0.10 (¥16) |
|  200 |  300 | $1.44 (¥216) | $0.21 (¥31) |
|  500 |  750 | $3.60 (¥540) | $0.52 (¥78) |
| 1000 | 1500 | $7.20 (¥1,080) | $1.04 (¥156) |

### 4.5 想定上振れシナリオ

| シナリオ | 計算 | gpt-5.2 月額 |
|---------|------|-------------:|
| 全issueがLarge、再レビュー2倍 (500件×3call×Large) | 500×3×$0.0104 | $15.60 (¥2,340) |
| Bot暴走で1日100件×30日連続 (3,000件×1call×Medium) | 3,000×$0.0048 | $14.40 (¥2,160) |
| Bot暴走+Large化 (3,000件×1call×Large) | 3,000×$0.0104 | $31.20 (¥4,680) |
| 究極上限: 10,000件×3call×Large | 10,000×3×$0.0104 | $312.00 (¥46,800) |

> 「究極上限」は Forge invocation quota / Atlassian側の rate limit に先に当たるため、実際にはここまで届かない。

### 4.6 試算方法のサマリ

1. 実際の prompt 構造を `src/core/openai-review.js` から抽出
2. 典型的な営業起票3パターン (Small/Medium/Large) のサンプル input をJSON化
3. `gpt-tokenizer` (o200k_base, GPT-4o系互換) でトークン数を実測
4. OpenAI公開価格 (2026年6月) を乗じて per-call コストを算出
5. 想定起票数 × 1.5 call/issue で月次コストを推定

実運用開始後は OpenAI dashboard の `Usage` を1か月実測し、本表を更新する。

### 4.7 推奨アクション

- **当面の運用**: gpt-5.2 で開始。月¥1,000 を超えない見込み（200起票/月想定）
- **コスト懸念が顕在化したら**: Forge variable で `OPENAI_MODEL=gpt-5.2-mini` に切替。コードデプロイ不要で 1/7 程度に下がる
- **OpenAI dashboard 側で月次ハード上限を $50 (≈¥7,500) 等に設定** → 想定の3倍以上の異常時に自動停止

## 5. 監視 / 撤退手順

### 5.1 監視

- OpenAI dashboard の Usage / Budget alert
- Forge `console.log` をベースに、後続で invocation 数と prompt version を CloudWatch相当 (Forge logs) に出力済み
- レビューコメント末尾に `aiProvider` / `promptVersion` を記録し、課金有無を事後追跡可能

### 5.2 すぐに止める手順（kill switch）

| 方法 | 効果 | 反映時間 |
|------|------|---------|
| Forge variable `OPENAI_API_KEY` を unset | 全 OpenAI 呼び出し停止（ルールベースに自動降格） | 数分 |
| `ALLOWED_PROJECT_KEYS` を空文字に変更 | レビュー pipeline 全停止 | 数分 |
| Forge app を uninstall | trigger / panel ともに停止 | 即時 |
| OpenAI dashboard で API key を revoke | 全 OpenAI 呼び出し停止 | 即時 |

## 6. 追加検討（運用前 / 運用後）

運用開始前に必須ではないが、必要に応じて追加する。

- [x] **`description` の文字数上限を実装し、超過時は truncate + 警告**（§2.3 で採用ルール化、上限 8,000 文字）
- [x] **1 issue あたりのパネル「再レビュー」連打を防ぐ上限**（§2.2 で採用ルール化、1日5回まで）
- [ ] 月次の invocation 数を Forge storage に集計し、しきい値超過で自動 disable
- [ ] OpenAI dashboard で**ハード上限**（hard limit）を契約レベルで設定
- [ ] mini系モデルでのA/B評価（品質劣化の許容範囲を見極める）

## 7. 関連ファイル

- `src/core/openai-review.js` — OpenAI Responses API 呼び出し本体
- `src/core/review.js` — フォールバック制御
- `src/core/project-filter.js` — project ホワイトリスト
- `src/adapters/forge/index.js` — Forge trigger / panel resolver
- `manifest.yml` — external egress 制限、scope
- `docs/architecture.md` — 全体アーキテクチャ
