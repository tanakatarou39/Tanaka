# MikuMikuDance の主窓の一部が黒くなる不具合 (Hangover, wined3d の OpenGL)

## 結論

見立て **A が正しい** と分かりました。ただし原因は Hangover だけにあるのではなく、上流の Wine にもあります。PC の上流 Wine (X11) でも、同じ症状を再現できました。

黒くなる理由は 2 つ重なっています。

1. **client surface が窓のクライアント領域全体を覆う**
   - MMD は D3D9 の Present で、プレビューの矩形 (393,25)-(1137,444) だけを描きます。
   - 一方 wined3d は、OpenGL の面 (client surface) を窓のクライアント領域全体に重ね、SwapBuffers します。
   - その面の dst_rect の外側は、一度も描かれません。描画の始めに wined3d が `glClear` した黒のままです。
   - client surface を描くとき、win32u もドライバーも、子窓・上の兄弟窓の部分しか抜きません。抜くのは Hangover の切り抜きも同じです。
   - そのため、ボタン (子窓) は出ますが、主窓に GDI で描いたパネルの地とタイムラインは、黒い面に隠れます。
   - Windows では、Present は dst_rect の部分だけを窓に写し、残りには GDI の描いた物が見えます。
2. **GDI の面の、クライアント領域が切り抜かれる**
   - ピクセル形式 (OpenGL) を持つ窓では、win32u がサーバーに `SET_WINPOS_PIXEL_FORMAT` を送ります。
   - 受けたサーバー (`get_surface_region`) は、窓の GDI の面の表示範囲 (clip) から、クライアント領域を外します。ただし子窓の部分は残します。
   - 上流の wineandroid は、外された部分を透明な黒 (0) で塗ります (`android_surface_flush` の `apply_line_region`)。
   - X11 では GDI はこの面を使わず、X の窓に直接描きます (dce.c の `pPutImage` の条件)。
   - したがって、1 の面を Present した矩形だけに絞っても、Android では GDI の地は黒いままのはずです。

見立て B (wined3d が GDI の StretchBlt で Present する経路) は、swap effect が `D3DSWAPEFFECT_COPY` のときにしか通りません (`swapchain_present_is_partial_copy`)。

- この経路では SwapBuffers は呼ばれず、client surface に画が出ません。プレビュー自体も見えなくなるはずです。
- 「プレビューは出るが地が黒い」という症状は、DISCARD か FLIP で GL の SwapBuffers を通る A の経路と一致します。
- 上流の X11 で DISCARD と FLIP を試すと、症状が完全に一致しました (下の表)。

DXVK で正しく出るのは、DXVK が GDI で Present するためです。窓にピクセル形式が付かず、client surface も、2 の切り抜きも起きません。

## 直し方

Present した矩形を wined3d から win32u に伝えます。win32u はそれを client surface に持たせ、ドライバーはその外を描きません。その外には GDI の面が見えるようにします。窓全体を Present するふつうのゲームでは、何も変わりません。

### Wine のパッチ (wine/ 以下、上流 0738d52 = 11.20 にそのまま当たる)

`wine-patches/` に 4 本あります。

| パッチ | 内容 |
|---|---|
| 0001 win32u | `pPutImage` の無いドライバー (Android など。client surface を GDI の面の上に重ねるもの) では、`SET_WINPOS_PIXEL_FORMAT` を送らない。GDI の面のクライアント領域を切り抜かず、client surface の無い部分に GDI の描いた物が見えるようにする (原因 2 の修正)。X11 は `pPutImage` を持つので変わらない。 |
| 0002 win32u | 新しい escape `D3DKMT_ESCAPE_SET_PRESENTED_RECT_WINE` (hContext = 窓、データ = クライアント座標の RECT) で、窓のうち Present する部分を受け取る。データが NULL なら窓全体、空の矩形なら何も無し。`struct client_surface` に `presented_rect` (virtual_rect と同じ座標) を足し、`WINE_GDI_DRIVER_VERSION` を 111 に上げる。値が変わったときは、`update_client_surfaces()` でドライバーに知らせる。 |
| 0003 winex11 | `presented_rect` が窓全体でないときは offscreen で描き、その部分だけを窓に写す (PC で端から端まで確かめるため。Android には要らない)。 |
| 0004 wined3d | GL の swapchain が、窓 (windowed) の一部だけを Present するときに、その dst_rect を escape で伝える。窓全体に戻ったら NULL を、GDI で Present する経路では空を伝える。値が変わったときしか呼ばない。swapchain を解放するときと、`dst_window_override` で窓が変わったときは元に戻す。 |

### Hangover のパッチ

`hangover-wineandroid-presented-rect.diff` (`patch -p1` をリポジトリーの一番上で使う) は、`get_client_clip()` の 2 か所だけを変えます。

- 切り抜きの元にする領域を、`virtual_rect` から `presented_rect` に変える。
- 窓全体でないときは、子窓が無くても「覆われている」として扱う。

表示サーバー (server.c, render.c) とプロトコルは、変えていません。今の `ADISP_REQ_CLIENT_CLIP` が、そのまま「見せる部分」になります。

- MMD の場合、切り抜きの矩形は 238 個から 2 個に減ります。プレビューの矩形から、その角に重なるパネルを除いた形です。
- 何も Present しない場合 (GDI で Present する経路) は 0 個になり、面は描かれません。

### 負荷

| 場面 | 変わること |
|---|---|
| 窓全体を Present するゲーム | wined3d は窓モードのときに Present ごとに `GetClientRect` を 1 回呼ぶ (dst_rect が NULL なら、wined3d は元々 Present ごとに呼んでいる)。escape は値が変わったときしか出さず、client surface・切り抜き・表示サーバーの処理は今までと同じ。全画面では何もしない。 |
| MMD | 表示サーバーが描く矩形が減って、かえって軽くなる。 |

## 確かめた結果 (PC)

### 1. 上流 Wine 11.20 (X11, Xvfb, Mesa llvmpipe) での D3D9 の試験 `test/partial_present.c`

試験の中身は次のとおりです。
- 窓 (800×480) を GDI で 4 色の帯に塗る。
- 子窓のボタンを 2 つ置く。1 つはプレビューの矩形に重ねる。
- D3D9 で、緑で Clear した後、矩形 (300,25)-(700,300) だけを Present する (src_rect = dst_rect、MMD と同じく dst_window_override = 窓)。
- その後、画面の 14 点の色を読む。期待値は、矩形の中が緑、外が GDI の帯の色、ボタンがボタンの色です。

試したのは次の場合です。
- swap effect: DISCARD、FLIP、COPY
- 種類: 窓全体の Present、一部の Present、子窓なし、一部から全体への切り替え、引き伸ばし (src_rect = NULL)

| swap effect, 種類 | 修正前 | 修正後 |
|---|---|---|
| DISCARD 窓全体 | 0 失敗 | 0 失敗 |
| DISCARD 一部 (MMD と同じ) | **10 失敗 (地がすべて黒)** | 0 失敗 |
| DISCARD 一部・子窓なし | **10 失敗** | 0 失敗 |
| DISCARD 一部→全体 | 0 失敗 | 0 失敗 |
| DISCARD 引き伸ばし | **10 失敗** | 0 失敗 |
| FLIP (DISCARD と同じ 5 種類) | 一部の 3 種類で 10 失敗ずつ | すべて 0 失敗 |
| COPY 窓全体 / 子窓なし / 一部→全体 | 0 失敗 | 0 失敗 |
| COPY 一部 / 引き伸ばし (子窓あり) | 3 失敗 | 3 失敗 (変わらず) |

ログは `test/x11-before.log` と `test/x11-after.log` です。修正前は、MMD の症状と同じく、矩形の中の緑とボタンは出て、GDI の帯が黒くなりました。

COPY の 3 件 (修正前から同じ) は、X11 だけの別の問題です。
- この経路では GDI の StretchBlt で Present します。窓の DC の面には緑が入りますが、ピクセル形式を持ち子窓もある窓では、X11 の画面に写りません。
- Android は 0001 で GDI の面がそのまま見えるので、この問題は起きません。
- MMD の症状 (プレビューは出る) とも合わないので、今回は直していません。

d3d9 の既存の試験は、修正後の Wine で回しました。
- `d3d9_test device`: 60,121 件中、失敗は 1 件 (「別の画面モードが見つからない」。画面モードが 1 つしかない Xvfb のため)。
- `d3d9_test visual`: 210,796 件で失敗 0 件。
- `d3d9_test d3d9ex`: 2,211 件で失敗 0 件。
- ログは `test/d3d9-*.log` にあります。

### 2. Hangover の client surface の単体試験 `test/client_test.c` (mingw で組み、Wine で動かす)

試験の作りは次のとおりです。
- ご提示の `client.c` から、修正前と修正後の `get_client_clip()` などをそのまま切り出す (`extract.py`)。
- Wine の本物の窓で動かす。1200×700 の主窓に子窓 (ボタン) を並べる。
- 求めた切り抜きを、表示サーバーの `req_client_clip()` と `draw_client_surfaces()` に通す (前回のパッチの server.c と、ご提示の render.c からそのまま切り出す)。
- 描かれた四角を画面の配列に塗り、期待する画素と 1 画素ずつ比べる。期待する画素は、Present した矩形を表示の倍率に合わせ、子窓を除いた部分です。

試した場合は次のとおりです。
- **配置:** 子窓なし、MMD に近い配置 (左のパネルのボタン 96 個、プレビューの下のボタン列、右下のパネル、プレビューの右のスクロールバー、プレビューの角に重なるパネル)、乱数の配置 6 種類。
- **Present する矩形:** 窓全体、MMD のプレビュー、1 行・1 列だけ欠けたもの、左半分、1 画素、窓から一部はみ出したもの、何も無し (GDI での Present)、乱数 6 種類。
- **倍率:** 1/1、3/2、3/4、7/3。

| 確かめたこと | 結果 |
|---|---|
| 確認の件数 | 1,952 件、失敗 0 件 |
| 窓全体を Present する 32 通り | 修正前と同じ切り抜き (件数と矩形がすべて一致) |
| 一部を Present する 352 通りで、GDI の部分に描かれた GPU の画素 | 修正前 337,676,355、修正後 0。描くべき所で描かれなかった画素も 0 |
| MMD の配置で、プレビューだけを Present (倍率 1/1) | 修正前は 335,544 画素の GPU の面が、パネルの地とタイムラインを覆っていた。修正後は 0 |

ログは `test/client_test.log` です。`hangover/app/jni/` の server.c と render.c は、試験で使う表示サーバーの抜粋です。server.c は前回のパッチ (ブランチ mmd-clip-fix) の後、render.c はご提示のものです。今回は変えていません。

## 動かし方

上流の Wine に当てる場合 (Hangover の wine/ にも同じように当たるはずです):

```bash
cd wine && git am ../mmd-present-fix/wine-patches/000[1-4]-*.patch
```

Hangover の client.c に当てる場合:

```bash
patch -p1 < mmd-present-fix/hangover-wineandroid-presented-rect.diff
```

試験を動かすには、mingw-w64 と Wine、X11 の試験には Xvfb と Mesa が要ります。

```bash
sh mmd-present-fix/test/run_client_test.sh
```

X11 の試験の引数には、Wine のビルドのディレクトリーを渡します。DISPLAY が必要です。

```bash
sh mmd-present-fix/test/run_x11.sh /path/to/wine-build
```

## 確かめていないこと・注意

- **実機:** Android の実機では動かしていません。
- **Hangover の win32u と window.c:** 中身は見ていません。
  - Hangover の win32u が上流と違い、client surface を別の所で作り直したり、`clip_clients` の扱いを変えていたりすると、0001 と 0002 が当たらないか、効かないことがあります。
  - Hangover の窓の面 (window.c) が、上流の wineandroid と同じく、切り抜かれた部分を 0 で塗るかは確かめていません。どちらであっても、0001 の後はクライアント領域が切り抜かれないので、結果は同じです。
- **他のドライバーへの影響:** 0001 は、`pPutImage` を持たない他のドライバー (wayland, mac) の振る舞いも変えます。上流に出すなら、ドライバーごとに選べる形にするのがよいかもしれません。Hangover では Android だけなので問題ありません。
- **MMD の swap effect:** 調べていません。
  - DISCARD か FLIP なら 0002・0004 と Hangover のパッチで、COPY なら 0001 で直るはずです (COPY の経路は、上の単体試験の「何も無し」の場合に当たります)。
  - `WINEDEBUG=+d3d9` の `d3d9_device_CreateDevice` の行 (または `+d3d` の `wined3d_swapchain_create` の swap_effect) で分かります。
- **wined3d の Vulkan の経路:** 変えていません。一部の Present では、元々 GDI で Present します。
