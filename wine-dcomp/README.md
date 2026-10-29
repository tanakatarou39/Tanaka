# Wine: WebView2 (Chromium 156) 向けの最低限の DirectComposition

WebView2 は、Wine が Windows 8.1 以降を名乗ると DirectComposition (dcomp.dll) を使います。今の Wine の dcomp は `DCompositionCreateDevice*()` がすべて `E_NOTIMPL` を返すため、何も表示されません。そこで `msedgewebview2.exe` だけ Windows 8 を名乗らせる回避策が使われています ([bug 58921](https://bugs.winehq.org/show_bug.cgi?id=58921))。

このパッチ群は、Chromium 156 が画面を出すのに使う部分だけを実装し、合成はソフトウェア (CPU) で行います。最初の目標「不透明なビジュアル 1 枚」を満たし、少し先の範囲まで入っています。

- パッチ: `0001`〜`0005` (英語のコミットメッセージ、`0000-cover-letter.patch` に概要)
- 土台: Wine master `0738d52` (Wine 11.20)。`git am` でそのまま当たることを確認済みです。
- テストの記録: `test/`

| パッチ | 内容 |
|---|---|
| 0001 | `include/dcomp.idl` に `IDCompositionVisualDebug`、`IDCompositionVisual3`、`DCompositionCreateDevice3()` を追加 |
| 0002 | dxgi: Direct3D 10/11 デバイスで `CreateSwapChainForComposition()` を実装 |
| 0003 | dcomp: デバイス・ターゲット・ビジュアル・矩形クリップを実装し、スワップチェーンを CPU で合成して窓に描く |
| 0004 | dcomp: 窓が再描画されたら合成し直す |
| 0005 | dcomp/tests: テストを追加 (120 件) |

## Chromium 156 が呼ぶもの

Chromium 156 の分岐点 (branch 8078、`156.0.8078.0`) のソースで確かめました。

1. **初期化** (`ui/gl/direct_composition_support.cc:710-786`)
   - `GetModuleHandle("dcomp.dll")` → `GetProcAddress("DCompositionCreateDevice3")`
   - D3D11 デバイスの `IDXGIDevice` を渡して `IDCompositionDesktopDevice` を作り、`IDCompositionDevice3` に QI します。どちらかが失敗すると DirectComposition は使われません。
   - `EXPERIMENTAL_IDCompositionDevice6` の QI は失敗してよいものです (D3D12 の経路用)。
   - `DCompositionGetFrameId` などは `UseCompositorClockVSyncInterval` が有効なときだけ使われ、これは既定で無効です (`ui/gl/gl_features.cc:116-123`)。
2. **機能の段階** (`components/viz/service/display_embedder/skia_output_device_dcomp.cc:58-72`)
   - `IDCompositionDevice4` が無いと「DC layers」段階になります (`direct_composition_support.cc:1213-1251`)。この段階では、メインの画面は `IDCompositionSurface` ではなく合成用スワップチェーンに描かれます (`components/viz/service/display/direct_renderer.cc:922`、`skia_renderer.cc:3778-3800`)。
   - このパッチは `IDCompositionDevice4` を返さないので、Chromium はこの段階で動きます。
3. **ツリーの組み立て** (`ui/gl/dc_layer_tree.cc`)
   - `CreateTargetForHwnd(window, TRUE)`。失敗すると CHECK で落ちます (:168)。
   - `CreateVisual` (:176)、`SetRoot` (:200)、`SetBitmapInterpolationMode` (:205)、`AddVisual` / `RemoveVisual`、`SetOffsetX/Y`、`SetTransform`、`SetClip`、`CreateRectangleClip`、`SetBorderMode`、`SetOpacityMode`、`SetContent`、`Commit` (:891)
   - 不透明度や 3D 変換を使うときは、`IDCompositionVisual3` への QI が CHECK されます (:48)。
4. **スワップチェーン** (`gpu/command_buffer/service/shared_image/dxgi_swap_chain_image_backing.cc`)
   - `CreateSwapChainForComposition`: `FLIP_SEQUENTIAL`、2〜3 枚、不透明なら `ALPHA_MODE_IGNORE`、そうでなければ `PREMULTIPLIED` (:68-100)
   - 毎フレーム `Present1` に dirty rect を 1 つ付けて呼びます (:261)。dirty rect の外は前のフレームの内容が残る前提です (:216 のコメント)。
   - `Commit` はツリーが変わったときしか呼ばれません。そのため、Present だけで画面が更新される必要があります。
5. **出力先の窓** (`ui/gl/child_window_win.cc:108-112`)
   - 専用スレッドが作る子窓で、`WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOREDIRECTIONBITMAP` と `WS_CHILD | WS_DISABLED | WS_VISIBLE` です。

## 仕組み

- **dxgi** (0002): 合成用スワップチェーンには、wined3d のために隠し窓を 1 つ付けます。この窓には何も描きません。
  - Present では wined3d の present を呼ばず、dcomp が `SetPrivateDataInterface()` で付けたコールバック `IWineDXGICompositionCallback` を呼びます。
  - バッファを回さないので、バッファ 0 が常に最新の絵です。dirty rect の外が残るという `Present1` の約束も、これで自然に守られます。
  - `GetHwnd()` は `DXGI_ERROR_INVALID_CALL` を返し、`GetDesc()` の `OutputWindow` は NULL、`GetDesc1()` は作成時の `AlphaMode` を返します。
- **dcomp** (0003): コールバックはバッファ 0 をステージングテクスチャに写し、`Map` で読んで BGRA で保持します。そのあと、そのスワップチェーンを含むコミット済みのターゲットを合成し直します。
  - 合成では、ツリーを奥から手前へ辿り、オフセット・平行移動・矩形クリップを当てて、窓のクライアント領域と同じ大きさのビットマップに描きます。premultiplied alpha の重ね合わせにも対応しています。
  - 窓には `GdiAlphaBlend` で描きます。透明な部分は窓の元の絵が見えます。
  - `UpdateLayeredWindow` で動くトップレベルのレイヤード窓 (bug のコメント 12〜13 の場合) にだけは、`UpdateLayeredWindow` で渡します。
  - Chromium と同じスタイルの子窓は、Wine では `GetDC` で描いたものが画面に出ることを確かめてあります (`test/probe2.c`、下の表)。
- **再描画** (0004): 窓やその親が WM_PAINT で描き直すと、合成した絵が消えます。そこで窓のスレッドにフックを 2 つ付けます。
  - 送られてきた WM_PAINT は、`WH_CALLWNDPROCRET` で処理後に捕まえます。
  - キューから来る WM_PAINT は `WH_GETMESSAGE` でディスパッチ前にしか見えないので、メッセージを 1 つポストし、それが取り出されたとき (描画後) に合成します。

## テスト結果 (Linux 上の Wine、Xvfb、llvmpipe)

- **dcomp の新テスト:** 120 件、失敗 0 です (`test/dcomp_test.log`)。
  - デバイス作成と QI、ターゲットの重複エラー、ビジュアルツリーの規則、参照カウントを確かめます。
  - スワップチェーンでは、赤を Present してから Commit、Commit なしの青の Present、オフセット、窓の再描画後も残ること、透明な内容で下の窓が見えることを確かめます。
  - 窓は普通のポップアップ窓と Chromium と同じスタイルの子窓の 2 種類で試し、色は画面の DC から読んでいます。
- **実際の X 画面:** `test/demo.c` (Chromium と同じ窓と呼び出し順) で緑を出し、Xvfb の画面を `import` で読んで緑になることを確かめました (`test/demo.log`)。
  - 0004 が無いと、親窓の再描画で灰色に戻ることも確かめています。
  - Wine の `GetDC(NULL)` は X 画面ではなく Wine の窓サーフェスを読むため、テストだけでは足りないと分かり、この確認を足しました。
- **dxgi の既存テスト:** パッチの前後とも失敗 62 件で、中身も同じです (`test/dxgi_test-before.log`、`test/dxgi_test-after.log`)。失敗は Xvfb で画面モードを変えられないことによるもので、今回の変更とは関係ありません。
- **ビルド:** 5 つのコミットそれぞれで警告 0 です (64 ビットのみ。32 ビットと ARM64 はビルドしていません)。
- **窓の種類ごとの描き方** (`test/probe2.c`、パッチなしの Wine master、X 画面で確認):

| 窓 | GetDC で描く | 子窓を作って描く | UpdateLayeredWindow |
|---|---|---|---|
| 普通の子窓 | 出る | – | – |
| Chromium と同じ子窓 (レイヤード、属性なし) | 出る | 出る | 出ない (TRUE は返る) |
| 同上に `SetLayeredWindowAttributes` | 出る | – | – |

## 確かめられていないこと

- **本物の Chromium / WebView2 では動かしていません。** Chromium 156 のスナップショット (`chrome-win.zip`、156.0.8078.0) は取得しました。しかし、Wine で `chrome.exe --no-sandbox` を起動する操作が自動許可の判定で止められたため、実行していません。WebView2 本体は、ライセンス (Wine 上での利用) が不明なため使っていません。
- Windows ではテストを動かしていません。エラーコードの一部 (`AddVisual` の誤用で `E_INVALIDARG`、別プロセスの窓で `E_ACCESSDENIED`) は推測です。
- Chromium が `IDCompositionSurface` を使う場面 (単色のオーバーレイ、動画の背景色) では `CreateSurface` が `E_NOTIMPL` を返すので、Commit がエラーになります。DC layers 段階では動画のオーバーレイのときに起きる見込みです。
- Commit 前のツリー変更が、その間の Present で見えてしまいます (本来は Commit で一度に反映されます)。Chromium は同じスレッドで変更から Commit まで続けて行うので、実害は小さいと考えています。
- 拡大縮小・回転・不透明度・エフェクト・アニメーション・角丸クリップは無視しています (FIXME を出します)。

## DXVK を使うときに必要なこと

DXVK を使うと、`dxgi.dll` が DXVK のものに置き換わります。そのため 0002 の dxgi の変更は使われず、DXVK 側に同じことが必要です。dcomp (0003〜0005) はそのまま使えます。

1. **`CreateSwapChainForComposition` を普通に作れるようにする。** DXVK 3.1.1 の既定は `E_NOTIMPL` です (`src/dxgi/dxgi_factory.cpp:282-298`)。`dxgi.enableDummyCompositionSwapchain = True` のときだけ、窓の無いスワップチェーンを作ります。これは HDR の確認などのためのダミーで、絵はどこにも出ません (`src/util/config/config.cpp:54-61` で ACShadows と Anno 117 だけ有効)。
2. **Present でコールバックを呼ぶ。** 合成用スワップチェーンの Present では、Vulkan の present をせずに次を行います。
   - `GetPrivateData(IID_IWineDXGICompositionCallback)` (`e0363b2f-75bf-49ae-95c0-7f4859828d99`) で dcomp が付けたコールバックを取り出す
   - `present(swapchain)` を呼ぶ
   
   dcomp は同じデバイスの immediate context でバッファ 0 をコピーして読むので、DXVK 側で特別な同期は要りません。DXVK はもともと `m_backBuffers[0]` に描かせて Vulkan のスワップチェーン画像へ写す作りで、バッファを回しません。そのためバッファ 0 が最新の絵という前提はそのまま成り立ちます。インターフェースの定義は 0002 の `include/wine/winedxgi.idl` にあります (メソッドは `present` の 1 つだけ)。
3. **細かい点:** `GetHwnd()` は `DXGI_ERROR_INVALID_CALL` を返し、`GetDesc1()` は作成時の `AlphaMode` を返すようにします。dcomp は premultiplied かどうかを `GetDesc1()` で判断します。
4. **今の DXVK のままだと:** dcomp の `SetContent` は DXVK のスワップチェーンにもコールバックを付けられます。しかし呼ばれないので、`SetContent` の時点の絵が 1 枚出るだけで、その後は更新されません。そもそも既定では `CreateSwapChainForComposition` が失敗するので、Chromium は DirectComposition を使わず、ここまで来ません。
5. **速さ:** 毎フレーム GPU から CPU へ読み戻し、GDI で描きます。WebView2 の UI 程度なら足りると思いますが、動画やアニメーションには重いはずです。
   - 次の段階としては、dcomp が窓の中に子窓を作り、DXVK がその子窓の Vulkan サーフェスへ直接 present する方法があります。dcomp から「この窓のこの位置に出して」と伝える 2 つ目の private interface が必要です。
   - Wine の win32u は子窓への Vulkan 出力に対応しているので、読み戻しが要らなくなります。
6. **VKD3D-Proton は関係しません。** Chromium の DirectComposition は D3D11 デバイスを使います。Graphite / Dawn の D3D12 経路で `CreateSwapChainForComposition` に D3D12 キューが来る場合は、このパッチ群でも未対応 (`E_NOTIMPL`) です。

## Hangover / Android での注意 (未確認)

- wineandroid.drv で、子窓への `GetDC` 描画と `GdiAlphaBlend` が画面に出るかは試していません。前の MikuMikuDance の調査で、wineandroid.drv は窓の一部への出力に手を入れる必要がありました。合成の出力も同じ経路を通ります。
- 読み戻しは Turnip / Mali のドライバー上の `Map` になり、PC より遅いはずです。
