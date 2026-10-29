# vkd3d-shader の fx_2_0 の state の代入のパッチ

上流の vkd3d (https://gitlab.winehq.org/wine/vkd3d) に向けた 14 本のパッチです。土台は `60e4cf03` (2026-10-29 時点の master) です。vkd3d-shader が書ける fx_2_0 (Direct3D 9 の effect) の state の代入を、定数のほかに次のものまで広げます。

| パッチ | 内容 |
|---|---|
| 0001–0009 | `compile` 式、パラメーターの参照、`sampler_state`、`TRUE`/`FALSE`、簡単な式 (FXLC)。前回の 9 本を新しい master に載せ直したもので、中身は変えていません |
| 0010 | 下ごしらえ。式の値を成分ごとに持つ形に変えます。swizzle と、値の変わらない cast では命令が要らなくなります |
| 0011 | 一時変数。`float4(a, 1.0, 0.0, b)` のような constructor を扱えるようにします。式の値に使われない命令は書きません |
| 0012 | **行列の式** (`m * 2.0`、`mul(m, n)`、`transpose`、`float4x4(...)`、`-rm + m`、`m3[0]`、`m[2].xyz`) |
| 0013 | **式の中の float から整数への変換** (`(int)x`、`(uint)x`、整数の state への代入)。0 に向かって切り捨てます |
| 0014 | **添字が変数の配列の選択** (`VertexShader = vs_arr[i];`、`Texture[0] = textures[f * 4.0];`、`FogDensity = densities[i + 1];`) |

コミットはどれも英語で、1 つの機能に 1 つのコミットです。各機能の shader_test は `tests/hlsl/effect-assignments-fx_2.shader_test` に足しました。前回 `[effect todo]` だった 3 つの場合 (行列の式、float から整数への変換、配列の選択) は、すべて `[effect]` で通るようになりました。

## 当て方

vkd3d の場合:

    git checkout 60e4cf03
    git am 000[1-9]-*.patch 001[0-4]-*.patch

Wine (Hangover の wine サブモジュール) の libs/vkd3d の場合。Wine の libs/vkd3d には tests/ が無いので、fx.c の部分だけを当てます:

    for p in 000[1-9]-*.patch 001[0-4]-*.patch; do
        git apply --directory=libs/vkd3d --include='libs/vkd3d/libs/vkd3d-shader/*' "$p"
    done

上流の Wine master (11.20、libs/vkd3d の最後の変更は 2026-10-15) で、14 本すべてが当たり、`fx.c` が mingw でコンパイルできることを確かめました。Hangover のサブモジュールそのものでは試していません。

## 書き方の要点

- **配列の選択**: resource の種類 2 (`FX_2_ASSIGNMENT_ARRAY_SELECTOR`) で書きます。中身は、配列の名前の長さ (4 の倍数にそろえたもの)、名前、添字を計算する fxlvm のコードの順です。d3dx9 は、名前の長さぶん進んだ所からコードを読みます (Wine の `d3dx_parse_array_selector`)。そのため、vkd3d の逆アセンブラーと d3dx9 の両方に合うよう、長さにはそろえたあとの値を入れます。
- **行列**: 式の結果は、行の順 (row-major) に出力のレジスターへ並べます。これは d3dx9 が state の値 (`D3DMATRIX`) として読む並びと同じです。入力の行列は CTAB に置き、majority に合わせて行ごと (row_major) か列ごと (column_major) に 1 レジスターずつ使います。vkd3d の IR では、column_major の行列の deref の添字は列を指すので、成分の対応は自前で求めています (`fxlc_get_deref_components`)。
- **float から整数への変換**: fxlvm には変換の命令がないので、`x - frc(x) + (x < 0) * (0 < frc(x))` で 0 に向かって切り捨てます。d3dx9 も出力を整数にするときに切り捨てますが、`(int)density + 10` のように変換のあとに計算が続く場合は、ここで切り捨てないと結果が変わります (density = -1.5 なら、正しくは 9、floor なら 8)。

## PC での確認の結果

| 試験 | 結果 |
|---|---|
| vkd3d の `make check` (Linux) | 314 件すべて PASS、XFAIL 0 ([make-check.log](make-check.log))。`effect-assignments-fx_2.shader_test` は XFAIL 0、SKIP 2 (前回と同じ) |
| d3dx9 で読み込む試験 (`wine-d3dx9-test/`、Wine 9.0 の d3dx9_36 と、vkd3d で作った d3dcompiler_47) | 151 件で失敗 0 ([effect_test-patched.log](wine-d3dx9-test/effect_test-patched.log))。前回は 84 件 |
| Wine 9.0 の d3dx9_36 の effect の試験 (233,824 件) | 失敗 5 件で、前回と同じものです (D3DXInclude まわりで、fx_2_0 の書き出しとは関係ありません) ([ログ](wine-d3dx9-test/wine-9.0-effect-tests-patched.log)) |
| MMD の effect (`mmd_full.fx`、6 technique) | 23 件で失敗 0。前回と同じく読み込めます |

d3dx9 の試験で新しく足した内容です。どれも、パラメーターを変えて `CommitChanges` したあとの値まで確かめています。

- `test_constructor_assignments`: `LightDiffuse` と `LightPosition` の constructor
- `test_matrix_assignments`: `WorldTransform`、`ViewTransform`、`ProjectionTransform`、`TextureTransform` の 16 要素と、`LightDirection = m[2].xyz`。column_major と row_major の両方の入力、float3x3 の入力も含みます
- `test_float_to_int_casts`: `AlphaRef`、`StencilRef`、`StencilMask`、`StencilWriteMask`。負の数の切り捨てを含みます
- `test_array_selectors`: `vs_arr[index]` と `ps_arr[f * 2.0]` で選ばれるシェーダーの版 (`GetPassDesc` と、`BeginPass` のあとのデバイス)、`densities[index + 1]`。添字を変えると選び直されることも確かめています

## 残りの制限

- **配列の選択は、state の値全体が配列の要素のときだけです。** `FogDensity = arr[i] * 2.0` のように式の中で変数の添字を使う場合や、uniform の配列を式の中で読む場合 (`colors[1] * 0.5`) は、未対応 (fixme) のままです。fxlvm の相対アドレスも使っていません。
- **整数の割り算・剰余・ビット演算** (`/`、`%`、`&` など) は未対応です。fxlvm は値をすべて浮動小数点で持つためです。
- **一部の組み込み関数**: `floor`、`ceil`、`round`、`sqrt` (と、それを使う `length`)、`saturate` は未対応です。`pow`、`lerp`、`clamp`、`step`、`exp`、`log`、`sin`、`cos`、`dot`、`mul`、`any` は使えます。
- **オブジェクトを選ぶ式** (`Texture[0] = f > 0.5 ? t1 : t2;`) は未対応です。
- **命令の数**: 行列の演算は IR の段階で成分ごとに分かれているので、命令もスカラーで、まとめていません。たとえば `mul(m, n)` は約 130 命令です。d3dx9 での結果は正しいですが、native の fxc よりは長くなります。
- **shader constant の state に行列を入れる場合** (`VertexShaderConstantF[4] = mul(a, b)`): Wine の d3dx9 は、先頭の 1 レジスターぶんしか値を写しません (`d3dx_set_shader_const_state` の `min(param->bytes, elem_size)`)。Wine の試験は native に合わせて書かれているので、native も同じ動きだと考えています。vkd3d 側の問題ではないので、手を入れていません。
- **native との比較**: 確かめたのは Wine の d3dx9 だけです。Windows の native の d3dx9 では試していません。また、出力は native の fxc とバイト単位では一致しません (CTAB や命令の選び方が違います)。
- **実機**: Hangover の実機では試していません (不要とのことでした)。
