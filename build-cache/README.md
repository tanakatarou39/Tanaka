# ビルドの再利用

GitHub Release `build-cache-2026-10-28` に、次の 2 つの圧縮ファイル (tar + zstd) を置いています。ファイルが大きいときは 1.9GB ごとに `.part-NN` に分けます。

| ファイル | 中身 (展開先 /home/user) |
|---|---|
| `wine-src-build.tar.zst` | `wine-src` (上流 Wine, commit 0738d52 + D3DKMT のパッチ 5 本, ブランチ d3dkmt-priority) と `wine-build` (その 64bit ビルド, configure の引数は wine-build/config.log) |
| `vkd3d-work.tar.zst` | `vkd3d` (fx2-state-assignments, build/ と build-mingw/ を含む), `xinc`, `wine-9.0` (試験の写し), `work`, `wtest*`, `ref` |

ソースとビルドを、ファイルの時刻ごとまとめて固めています。展開したあとソースを `git pull` しても、変わったファイルだけが再ビルドされます。

```bash
sh build-cache/restore-build-cache.sh
```

このスクリプトは次のことをします。
- 必要な apt パッケージを入れる
- Release から圧縮ファイルを取ってきて、SHA256 を確かめる
- `/home/user` に展開する

ビルドのディレクトリは `../wine-src` のような相対の参照を持っているので、`/home/user` 以外に展開しないでください。
