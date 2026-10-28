# Wine: D3DKMT{Get,Set}ProcessSchedulingPriorityClass

上流の Wine (https://gitlab.winehq.org/wine/wine) 向けのパッチです。対象は commit `0738d52` (dmusic: Check the fmt chunk size in parse_wave_chunk.) です。

```bash
git am wine-d3dkmt-priority/000[1-5]-*.patch
```

1. include: 列挙型 `D3DKMT_SCHEDULINGPRIORITYCLASS` と関数の宣言
2. server: プロセスごとに優先度を記録する要求 `d3dkmt_set_process_priority` / `d3dkmt_get_process_priority`
3. win32u: `NtGdiDdDDI{Get,Set}ProcessSchedulingPriorityClass` の実装 (spec、syscall、wow64win の変換を含む)
4. gdi32: `D3DKMT{Get,Set}ProcessSchedulingPriorityClass` の export
5. win32u/tests: 試験

## 振る舞い
- 優先度が IDLE〜REALTIME の範囲外: `STATUS_INVALID_PARAMETER` (記録している値は変わらない)
- 不正なハンドル: `STATUS_INVALID_HANDLE`
- 権限の足りないハンドル: `STATUS_ACCESS_DENIED` (Set は `PROCESS_SET_INFORMATION`、Get は `PROCESS_QUERY_LIMITED_INFORMATION` が必要)
- REALTIME: SeIncreaseBasePriorityPrivilege が有効でなければ `STATUS_PRIVILEGE_NOT_HELD` (OBS はこれを記録するだけで続ける)
- 優先度を一度も設定していないプロセスは NORMAL を返す
- 値は記録するだけで、GPU のスケジューリングには反映しない (FIXME を 1 回出す)

## 試験の結果 (Linux, Wine をこのパッチ入りで 64bit ビルド, Xvfb)
足した試験だけを実行した結果: 親プロセス 49 件、子プロセス 7 件、どちらも失敗 0。

```
d3dkmt: 7 tests executed (0 marked as todo, 0 as flaky, 0 failures), 0 skipped.
d3dkmt: 49 tests executed (0 marked as todo, 0 as flaky, 0 failures), 0 skipped.
```

d3dkmt の試験全体は、GPU の無い環境では既存の test_shared_fences で止まるため、足した試験だけを呼ぶ一時的な変更を加えて実行しました (この変更はパッチには含まれていません)。

## 未確認の点
- Windows 実機での確認はしていません。次の 3 点は Microsoft の文書と OBS の記録からの推定です。
  - 権限の確認に使うアクセス権の種類 (試験では SYNCHRONIZE だけのハンドルが拒否されることだけを確かめています)
  - REALTIME で特権が要るかどうか
  - 特権を持っているが有効にしていない場合の結果 (試験では broken() で成功も許しています)
- 32bit (wow64) の変換はコンパイルしただけで、動かしていません。
