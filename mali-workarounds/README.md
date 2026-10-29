# Mali の Vulkan で DXVK・VKD3D-Proton・zink を動かす回避策 (WinlatorMali の調査)

WinlatorMali (https://github.com/GunaCharanTeja/WinlatorMali、`bionic-mali-1.2` の `428bd94`、2026-10-29) を調べました。Mali 向けの回避策のうち、Hangover (Wine 11.20 + DXVK 3・DXVK 1.10・VKD3D-Proton・Mesa zink) に取り込めるものをまとめます。端末では試していません。

## 要点

- **WinlatorMali のリポジトリーには、回避策の本体のソースがありません。** 回避策のほとんどは、同梱のバイナリー `wrapper.tzst` (Vulkan の wrapper ICD) と `leegao_bcn.tzst` (BCn layer) の中にあります。
  - `wrapper.tzst` の `version.txt` は「GameNative Unified Vulkan Wrapper 1.3.303 (BCn & Mali Optimized)」です。
  - そのソースは GameNative の Mesa の fork (https://github.com/GameNative/mesa、既定のブランチ `wrapper-25`、`src/vulkan/wrapper/`) で公開されています。leegao の bionic-vulkan-wrapper を引き継いだものです。
  - 以下の「中身」は、このソースの最新 (`6bcfbaa`、2026-10-27) を読んで書きました。WinlatorMali 同梱のバイナリーは、それより少し前の版です。バイナリーの中の環境変数名から見ると、Vulkan 1.3 の偽装などはまだ入っていません。
- WinlatorMali 自身 (Java のコード) が Mali 向けにしていることは、少ししかありません。
  - wrapper と BCn layer の環境変数を設定する
  - `dxvk.conf` を書き出す
  - `BOX64_MMAP32=0` を設定する
  - Mali では `opengl32` を native にしない
- **Hangover にとって一番大事なのは、wrapper の「機能の偽装」と「足りない機能のエミュレーション」です。** 最新の DXVK・VKD3D-Proton は Mali の公式ドライバーに足りない機能を必須にしているので、何もしなければアダプターとして選ばれません。
- **ただし wrapper の ICD を、そのまま Hangover に入れるのは難しいです。** wrapper は表示 (WSI) を Mesa の WSI で行います。その WSI には、X11・Wayland・headless の面はありますが、Android の面 (`VK_KHR_android_surface`) の実装がありません。この拡張は名前だけ出しています (`wrapper_instance.c:41`)。Hangover の wineandroid.drv は Android の窓に Vulkan の面を作るので、この点を解決する必要があります。
- 一番小さく取り込めるのは、**zink の 2 本のパッチ** (`zink-patches/`、上流の Mesa にそのまま当たります) と、**`dxvk.conf` の見直し**です。WinlatorMali が書く `dxvk.conf` の項目は、多くが今の DXVK には存在しません (後で詳しく)。

## 1. Mali で動かない原因

### DXVK (最新、`0cfe089`、2026-10-28)

必須の条件は、`src/dxvk/dxvk_device_info.cpp` の `checkDeviceCompatibility()` と、`ENABLE_FEATURE(..., true)` の一覧で決まります。

- Vulkan 1.3
- 主な必須の機能: `textureCompressionBC`、`shaderClipDistance`、`shaderCullDistance`、`depthClamp`、`depthBiasClamp`、`fillModeNonSolid`、`dualSrcBlend`、`multiDrawIndirect`、`multiViewport`、`geometryShader`、`shaderInt64`、`shaderInt16`、`hostQueryReset`、`vulkanMemoryModel`
- 必須の拡張: `VK_EXT_robustness2` の `robustBufferAccess2` と `nullDescriptor`、`VK_KHR_maintenance5` と `VK_KHR_maintenance6`、`VK_KHR_load_store_op_none`
- push data が 256 バイト以上 (descriptor heap が無い場合)

wrapper のソースの注釈には、DXVK の版ごとに増えた要件も書かれています。2.4.1 より後で `maintenance5`、2.6 から push constant 256 バイト、2.7 から `pipeline_library` と `shaderInt64` です。

Mali の公式ドライバーで欠けていて、wrapper が偽装か補完しているもの:

- `textureCompressionBC`
- `shaderClipDistance` と `shaderCullDistance`
- `VK_EXT_robustness2`
- `extendedDynamicState` と `extendedDynamicState2`
- `dualSrcBlend`、`multiDrawIndirect`
- `VK_KHR_push_descriptor`
- `VK_KHR_maintenance5`
- `hostQueryReset`
- Vulkan 1.3 そのもの (古いドライバー)

### DXVK 1.10 (`v1.10.3`)

Vulkan 1.1 で動きます。`robustness2` も必須ではありません。

それでも D3D9・D3D11 のデバイスを作るときに、`textureCompressionBC`、`shaderClipDistance`、`shaderCullDistance`、`depthClamp`、`fillModeNonSolid` などを必須にします (`d3d9_device.cpp:3895-3937`、`d3d11_device.cpp:1933-2008`)。そのため、BCn と clip distance の偽装が無いと、Mali ではデバイスを作れません。

### VKD3D-Proton (最新、`4522cc1`、2026-10-28)

`libs/vkd3d/device.c` で必須にしているもの:

- Vulkan 1.3
- `VK_EXT_robustness2` (`nullDescriptor` を含む)
- `VK_KHR_push_descriptor`
- `maintenance5` と `maintenance6`
- `vertex_attribute_divisor`
- `shaderDrawParameters`
- `samplerMirrorClampToEdge`
- transform feedback
- 大きな descriptor heap

wrapper の注釈には、Mali について次のことが書かれています。

- r44 には `VK_KHR_push_descriptor` も `vertex_attribute_divisor` もない。r51 は KHR の `vertex_attribute_divisor` を持つ。
- r44 の UpdateAfterBind の上限は約 50 万個で、vkd3d が `bindless_state_init` で止まる。
- `maxBoundDescriptorSets` が 8 未満のドライバーがある。

### zink

zink は DXVK ほど多くを必須にしません。WinlatorMali が直したものは、ドライバーの不具合への対応と、zink の側の誤りです。

- **Pipetto-crypto の Mesa 24.3 の修正** (GameNative の Mesa の `zink-kopper-mali-24.3` ブランチ):
  - `12ef937`: Vulkan のメモリーモデルを、拡張があるかではなく機能があるかで判断する。Mali では、入出力を全部スカラーに分ける処理も止める。
  - `6aa8ce4`: conditional rendering の拡張が無いときは、バッファーにその用途の bit を付けない。
- **WinlatorMali の `fd22586`**: wrapper を通すと、zink の mutable format の swapchain で Mesa の WSI が abort するので、`VK_KHR_swapchain_mutable_format` を隠します。これは wrapper の WSI の不具合で、Mali の不具合ではありません。Hangover が wrapper を使わないなら関係ありません。
- WinlatorMali は最後のコミット `0eb2800` (2026-10-28) で zink を外し、Gladio (GL を GLES に変換するもの) だけにしました。zink は Mali では安定しなかったのだと思います。

## 2. 回避策の一覧

「効く Mali」は、wrapper の注釈に書かれた範囲と、私の知識からの推定です。Mali は世代 (Bifrost・Valhall・5th gen) よりも、端末に入っているドライバーの版 (r44、r51 など) で機能が変わります。実際に取り込む前に、対象の端末の `vulkaninfo` で確かめてください。

「手間」は、小 = 設定かパッチ数行、中 = 数百行の移植、大 = 千行以上か、設計からです。

### A. 機能・拡張の偽装 (wrapper の `wrapper_physical_device.c:330-620`)

| 回避策 | 中身 | 効く Mali | Hangover のどこ | 手間 |
|---|---|---|---|---|
| A1 `textureCompressionBC` を常に有る扱いにする (`:344`) | BC の画像は B1 で作り直す | 全世代 (Mali には BC のハードウェアが無い) | Vulkan のレイヤー | B1 と組で大 |
| A2 `shaderClipDistance`・`shaderCullDistance` を有る扱いにし、SPIR-V から ClipDistance を消す (`:346`、`spirv_patcher.cpp` の `remove_ClipDistance`) | clip plane は効かなくなる (描画が少し違うが、動く) | 全世代 (推定) | レイヤー | 中 |
| A3 `fillModeNonSolid`・`depthClamp`・`depthBiasClamp`・`multiViewport` を有る扱いにする (`:327-331`) | 偽装だけ。使われると結果が違う | 古いドライバー (推定) | レイヤー | 小 |
| A4 `VK_EXT_robustness2` (`robustBufferAccess2`・`nullDescriptor`) を有る扱いにする (`:488`、DXVK・vkd3d のときだけ) | 中身は偽装だけで、null descriptor の扱いはドライバーまかせ | robustness2 の無いドライバー | レイヤー | 小 (ただし危険) |
| A5 `extendedDynamicState`・`extendedDynamicState2`・`dualSrcBlend`・`multiDrawIndirect` を有る扱いにする (`:496`) | EDS は `wrapper_core13.c` で、pipeline を作り直してエミュレーションする | 全世代 (ARM の公式ドライバー) | レイヤー | 大 |
| A6 `VK_EXT_calibrated_timestamps` を隠す (`:519`) | ドライバーの不具合を避ける | ARM の公式ドライバー全般 | レイヤー、または `VK_EXT_calibrated_timestamps` を使う側 | 小 |
| A7 DXVK・vkd3d 以外 (zink など) では EDS・EDS2 を隠す (`:522`) | ドライバーの EDS の不具合を避ける | ARM の公式ドライバー全般 | zink の側 (`zink_screen.c` のドライバーごとの回避策)、またはレイヤー | 小 |
| A8 compute だけの queue family を隠す (DXVK のとき、`:553`) | DXVK が非同期の compute を使わないようにする | 全世代 (推定) | レイヤー | 小 |

### B. 足りない機能のエミュレーション

| 回避策 | 中身 | 効く Mali | Hangover のどこ | 手間 |
|---|---|---|---|---|
| B1 BCn の変換 (`WRAPPER_EMULATE_BCN`、`wrapper_bcn_gpu.c` ほか) | BC1–7 を GPU の compute で ASTC か RGBA8 に変換する。変換したものはディスクに保存できる (`WRAPPER_USE_BCN_CACHE`)。WinlatorMali は、これとは別の leegao の BCn layer (`VK_LAYER_BCN_BCnLayer`) を既定で使う | 全世代 | レイヤー | 大 (ソースは MIT で、astcenc の Apache-2.0 も含む) |
| B2 `VK_KHR_push_descriptor` (`wrapper_device.c:1269` 付近) | 普通の descriptor set に置き換える | r44 など、無いドライバー | レイヤー | 中 |
| B3 vertex attribute divisor (`wrapper_divisor.c`) | 無いドライバーでは shader の中で計算する。0 の divisor も補う | r44 (どちらも無い)。r51 は KHR があり、0 の divisor だけ補う | レイヤー | 大 |
| B4 `VK_KHR_maintenance5` (DXVK・vkd3d のとき、`:563`) | entrypoint を wrapper が実装する | 無いドライバー | レイヤー | 中 |
| B5 `hostQueryReset` (`:454`) | command buffer で reset する | 無いドライバー | レイヤー | 小〜中 |
| B6 Vulkan 1.3 に見せる (`wrapper_core13.c`、`WRAPPER_EMULATE_VULKAN_1_3`) | SPIR-V 1.6 を 1.3 に下げる。demote もここで下げる (`wrapper_spirv_lower.c`) | Vulkan 1.1 / 1.2 のドライバー (Bifrost と古い Valhall、推定) | レイヤー | 大 |
| B7 descriptor set を 8 個に見せる (`wrapper_set_fold.c`、vkd3d のとき) | bindless の set をたたむ | `maxBoundDescriptorSets` が 8 未満のドライバー | レイヤー | 大 |
| B8 `VK_EXT_map_memory_placed` (`wrapper_device_memory.c:537-840`) | host visible なメモリーを dma-buf heap か AHardwareBuffer から取り、ドライバーに import して、指定の番地に `mmap` する | placed map の無い全ドライバー | Wine (win32u) か、レイヤー | 大 |
| B9 SPIR-V の `OpConstantComposite` を `OpSpecConstantComposite` に直す (`spirv_patcher.cpp`) | bool のベクトルで、成分が全部 spec constant のもの。ARM の公式ドライバーのときだけ (`wrapper_patches_spirv()`) | ARM の公式ドライバー全般 | レイヤー (A2 と同じ所) | 小 |

B8 は、Hangover の **32 ビットのゲーム (WoW64)** に直接効きます。

- Wine 11.20 の win32u は、32 ビットのプロセスでは、`VK_EXT_map_memory_placed` か `VK_EXT_external_memory_host` で 4 GB より下に写します (`dlls/win32u/vulkan.c:505-536`)。
- どちらも無いと、`vkMapMemory` が `VK_ERROR_OUT_OF_HOST_MEMORY` で失敗します (`:1199-1205`)。
- Mali の公式ドライバーにこの 2 つがあるかは、まず `vulkaninfo` で確かめてください。WinlatorMali (と GameNative) が placed map をエミュレーションしているので、無い端末が多いのだと思います。

### C. 設定 (WinlatorMali の Java のコード)

| 回避策 | 場所 | 中身 | Hangover で | 手間 |
|---|---|---|---|---|
| C1 `dxvk.conf` | `DXVKConfigDialog.java:256-263` | Adreno でなければ `d3d11.relaxedBarriers`、`d3d11.ignoreGraphicsBarriers`、`dxvk.useEarlyDiscard`、`d3d11.allowMapFlagNoWait`、`dxvk.shrinkBindingSlots`、`d3d11.maxQueuedFrames = 1` を書く | 下の注意を参照 | 小 |
| C2 `BOX64_MMAP32=0` | `GuestProgramLauncherComponent.java:352` | Mali では、box64 の 32 ビットのメモリーの写し方を止める | Hangover で box64 を使っている場合だけ | 小 |
| C3 `opengl32` を native にしない | `WineUtils.java:91` | Mali では、ARM64EC 向けの opengl32 (zink) を使わない | zink を Mali で使うかどうかの判断材料 | 小 |
| C4 Mali の GPU 使用率と周波数 | `MaliGpuCounters.java`、`mali_counters.cpp` | `/sys/class/misc/mali0/device/utilization` などを読む | HUD を作るなら | 小 |

**`dxvk.conf` の注意**: 今の DXVK (2026-10-28) と 1.10.3 の両方で、ソースに項目があるかを確かめました。

| 項目 | DXVK 1.10.3 | DXVK (最新) |
|---|---|---|
| `d3d11.relaxedBarriers` | ある | ある |
| `d3d11.ignoreGraphicsBarriers` | ある | ない (今は `d3d11.relaxedGraphicsBarriers`) |
| `dxvk.useEarlyDiscard`、`d3d11.allowMapFlagNoWait`、`dxvk.shrinkBindingSlots`、`d3d11.maxQueuedFrames`、`dxvk.memoryTrack` | ない | ない |

- 無い項目は、黙って無視されます。WinlatorMali が同梱する DXVK の fork (sarek・async) にあるのかもしれません。
- `relaxedBarriers` は、描画が壊れることのある、ゲームごとの回避策です。既定にはしない方がよいです。
- DXVK の最新は、ARM の公式ドライバーで `dxvk.tilerMode` を自動で有効にします (`dxvk_device.cpp:723-737`)。Mali 向けに足すものは、ほとんどありません。

## 3. Hangover のどこに入れるか

Hangover の Vulkan は、Wine の win32u が `dlopen(SONAME_LIBVULKAN)` で読む `libvulkan.so` (`dlls/win32u/vulkan.c:3133`) を通って、端末のドライバーに届きます。回避策を入れる所は、次の 3 つが考えられます。

1. **wrapper の ICD を、そのまま使う**
   - Khronos の Vulkan loader を bionic 向けに作って同梱します。win32u が読む `libvulkan.so` をその loader にし、`VK_DRIVER_FILES` で wrapper の ICD を指します。WinlatorMali と GameNative はこの形です。
   - 利点: A・B の回避策が全部、すぐに手に入ります。
   - 欠点: 上に書いたとおり、wrapper の WSI には Android の面がありません。Hangover の wineandroid.drv が作る `VkAndroidSurfaceKHR` を表示するには、次のどちらかが要ります。
     - wrapper に、表示をドライバーへそのまま渡す経路を足す
     - Hangover の表示を、wrapper の扱える方式 (AHardwareBuffer を表示サーバーに渡す方式) に合わせる
   - 手間: 大。NDK で Mesa の wrapper を作る手間も加わります (GameNative の `gamenative-ci` ブランチにビルドの手順があります)。
2. **Mali 用の Vulkan のレイヤーを作る** (おすすめ)
   - Khronos の loader と、Hangover 専用の implicit layer を同梱します。layer は機能の偽装 (A) と SPIR-V の書き換え (A2・B9) を行い、WSI はドライバーにそのまま渡します。
   - leegao の BCn layer も同じ作りです (`VK_LAYER_BCN_BCnLayer`)。
   - 利点: 表示の問題が起きません。必要な回避策だけを、wrapper のソース (MIT) から移せます。
   - 手間: 最初の版 (A2・A3・A4・A6・A8・B9) は中。B1 (BCn) と B2・B3 を足すと大です。
3. **Wine (win32u) に入れる**
   - win32u は、すでに物理デバイスの拡張を選び直しています。偽装はここでもできます。
   - B8 (placed map) は、win32u の `vkMapMemory2KHR` と `vkAllocateMemory` に入れる手もあります。
   - ただし、上流の Wine には入りません。Hangover の Wine にだけ持つパッチになります。手間は中〜大です。

**zink の修正 (A7 と `zink-patches/`)** は、Hangover が作る Mesa の zink に、直接当てます。

## 4. ライセンス

| 物 | ライセンス | 取り込み |
|---|---|---|
| WinlatorMali の Java と C++ のコード | `LICENSE` は MIT (Copyright 2023 BrunoSX)。README のバッジは「GPL v3 / LGPL v2.1 / MIT」 | 設定の考え方だけを使うので、問題ありません |
| WinlatorMali に入っている proot | GPL-2.0 | 使いません |
| WinlatorMali に入っている patchelf | GPL-3.0 | 使いません |
| ZeroFG | Apache-2.0 / BSD-3-Clause | 使いません |
| libadrenotools | BSD-2-Clause (README には GPL v3 とありますが、上流の `LICENSE` は BSD 2-Clause でした) | 使いません |
| wrapper (GameNative の Mesa の `src/vulkan/wrapper/`、leegao の bionic-vulkan-wrapper) | 各ファイルにライセンスの記載がありません。Mesa の `docs/license.rst` の既定 (MIT) に従うと読めます | 移すなら、念のため作者に確認するのが安全です |
| wrapper の中の astcenc | Apache-2.0 | B1 で使うなら |
| wrapper の中の bcdec | MIT か Unlicense の選択 | B1 で使うなら |
| leegao の BCn layer (WinlatorMali が改変したもの) | バイナリーだけで、ソースもライセンスの記載もありません (`version.txt` は「Modified Version Of Leegao's Bcn Layer By Fcharan/WinMali-Dev」) | **取り込めません**。BCn は B1 (wrapper の中の実装) を使ってください |
| wrapper のバイナリー (`wrapper*.tzst`) | ソースは上記のとおり。ただし WinlatorMali のバイナリーの元のコミットは分かりません | バイナリーをそのまま再配布するより、ソースから作り直す方がよいです |
| Pipetto-crypto の zink の修正 | Mesa (MIT) | 下のパッチは、上流の今のコードに合わせて書き直したものです |

## 5. パッチの案: zink (`zink-patches/`)

上流の Mesa main (`4b0d67e`、2026-10-29、27.0.0-devel) に向けた 2 本です。`git am` で当たります。Mesa 26.2.6 にも、`git apply --check` で当たることを確かめました。

| パッチ | 内容 | 効く Mali |
|---|---|---|
| 0001 `zink: only use the Vulkan memory model when the feature is supported` | Vulkan 1.3 より前は、`vulkanMemoryModel` は任意の機能です。拡張があるかではなく、機能があるかで、SPIR-V にメモリーモデルを書くかを決めます。`zink_device_info.py` に機能の構造体を足します。Vulkan 1.2 の core の場合は、生成されるコードが `feats12` から写します (生成された `zink_device_info.c:1208` で確かめました) | Vulkan 1.1 / 1.2 のドライバー、または機能を持たないドライバー |
| 0002 `zink: don't use conditional rendering buffer usage without the extension` | `VK_EXT_conditional_rendering` が無いのに、query buffer に `VK_BUFFER_USAGE_CONDITIONAL_RENDERING_BIT_EXT` を付けていたのをやめます。仕様違反です。ドライバーによってはバッファーを作れません | conditional rendering の無いドライバー (Mali の公式ドライバーには無いと思います) |

確かめたこと:

- PC (Linux) で、zink だけの Mesa を meson で作りました。2 本を当てた `libzink.a` が、警告 0 でコンパイルできました ([libzink-build.log](zink-patches/libzink-build.log))。
- 確かめられなかったこと:
  - Mesa 全体 (libGL まで) のビルドと、lavapipe での実行。この環境の自動の許可判定で止められました。
  - ただし lavapipe は 2 つの機能を両方持っているので、動かせても、変えた分岐は通りません。
  - Mali の端末でも試していません。

Pipetto-crypto の 3 つ目の修正 (Mali で、入出力をスカラーに分けない) は入れていません。上流の今の zink では、スカラーに分けるのは clip distance と tess level だけになっています (`zink_compiler.c:5802-5808`)。

## 6. おすすめの順

1. **対象の端末で `vulkaninfo` を取る。** 2 章に挙げた機能と拡張のうち、何が無いかを確かめます。特に次のものです。
   - `textureCompressionBC`、`shaderClipDistance`
   - `VK_EXT_robustness2`、`VK_KHR_push_descriptor`、`VK_KHR_maintenance5`、`VK_KHR_maintenance6`
   - `VK_EXT_map_memory_placed`、`VK_EXT_external_memory_host`
   - `apiVersion`、`maxBoundDescriptorSets`、`maxPushConstantsSize`
2. **zink のパッチ (5 章)** と A7 (Mali では EDS を使わない) を、Hangover の Mesa に入れる。手間は小です。
3. **`dxvk.conf` を見直す。** 今ある項目だけにします。手間は小です。
4. **Mali 用の Vulkan のレイヤーを作る (3 章の 2)。** まず A2・A3・A4・A6・A8・B9 を入れます。これで DXVK 1.10 は、BCn を使わないゲームなら動き始めるはずです。
5. **B1 (BCn) をレイヤーに移す。** ほとんどの D3D のゲームに要ります。
6. 最新の DXVK と VKD3D-Proton を使うなら、ドライバーの版によって、B2・B3・B4・B5・B6・B7 も要ります。32 ビットのゲームには B8 も要ります。手間は大です。

## 7. 確かめていないこと

- 端末では、何も試していません。どの Mali が何を持たないかは、wrapper の注釈と私の知識からの推定です。
- WinlatorMali 同梱の wrapper のバイナリーが、GameNative の Mesa のどのコミットから作られたかは分かりません。環境変数の一覧から見ると、最新より前の版です。
- Hangover の Vulkan の読み込み方 (Android の loader を使っているか、自前で持っているか) は、Hangover のソースが手元に無いので、Wine の上流のコードから推定しました。

## 調べたソース

| ソース | 版 |
|---|---|
| WinlatorMali | `428bd94` (2026-10-29) |
| GameNative/mesa の `wrapper-25` | `6bcfbaa` (2026-10-27)。`zink-kopper-mali-24.3` も |
| leegao/bionic-vulkan-wrapper | `3abf487` |
| xMeM/mesa の `wrapper` | `e65c7eb` (元祖。Mali 向けの回避策はありません) |
| DXVK | `0cfe089` (2026-10-28) と `v1.10.3` |
| VKD3D-Proton | `4522cc1` (2026-10-28) |
| Mesa | `4b0d67e` (2026-10-29) |
| Wine | 11.20 (`dlls/win32u/vulkan.c`) |
