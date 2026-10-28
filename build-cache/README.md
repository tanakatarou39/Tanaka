# ビルドの再利用

ブランチ `build-cache-data` に、次の 2 つの圧縮ファイル (tar + zstd) を置いています。GitHub の上限 (1 ファイル 100MB) に合わせて、95MB ごとの `.part-NN` に分けています。このセッションでは GitHub Release を作れなかったため、ブランチに置いています。

| ファイル | 中身 (展開先 /home/user) |
|---|---|
| `wine-src-build.tar.zst.part-00〜06` (696MB) | `wine-src`: 上流 Wine (commit 0738d52) に D3DKMT のパッチ 5 本を当てたもの (ブランチ d3dkmt-priority)。`wine-build`: その 64bit ビルド (configure の引数は wine-build/config.log)。 |
| `vkd3d-work.tar.zst.part-00` (69MB) | `vkd3d` (fx2-state-assignments, build/ と build-mingw/ を含む), `xinc`, `wine-9.0` (試験の写し), `work`, `wtest*`, `ref` |

ソースとビルドを、ファイルの時刻ごとまとめて固めています。展開したあとソースを `git pull` しても、変わったファイルだけが再ビルドされます。展開した直後の `make` で走るのは、毎回作り直される `version.o` とそのリンク程度です。

```bash
sh build-cache/restore-build-cache.sh
```

このスクリプトは次のことをします。
- 必要な apt パッケージを入れる
- `build-cache-data` を浅く clone して、SHA256 を確かめる
- `/home/user` に展開する (引数で別の場所も指定できますが、`wine-src` と `wine-build` は並べたままにしてください)

要らなくなったら、`build-cache-data` ブランチを消すと、リポジトリーの容量も減ります。
