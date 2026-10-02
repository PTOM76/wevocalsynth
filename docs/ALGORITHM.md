# アルゴリズム
WeVocalSynth の音声処理（ピッチ変更・時間伸縮・フォルマント補正・解析・合成）が、どういう考え方で動いているかをまとめる。コードを読む前に全体の仕組みをつかむためのもの。細かい値や実装の工夫は、各ファイルの先頭のコメントにある。(2026-10-01 時点)

関連: [アーキテクチャ](ARCHITECTURE.md) / [決定事項](DECISIONS.md) / [ボーカル抽出](EXTRACTOR.md)

## 用語

| 用語 | 意味 |
| --- | --- |
| 時間伸縮（タイムストレッチ） | 音の高さを変えずに、長さだけを変えること |
| ピッチ変更（ピッチシフト） | 長さを変えずに、音の高さだけを変えること |
| リサンプル | 音声を別の速さで読み直すこと。速く読むと短く高く、遅く読むと長く低くなる |
| F0（基本周波数） | 声の高さ。1 秒あたりの声帯の振動回数（Hz） |
| フォルマント | 声のスペクトルの山の並び。母音や声質（太さ・細さ）を決める |
| スペクトル包絡 | スペクトルの細かい凹凸（倍音）をならした、なだらかな形。フォルマントはこの山 |
| オーバーラップ加算 | 短い断片を窓（端が 0 になる重み）で切り出し、少しずつ重ねて足し合わせること |
| STFT / FFT | 音声を短い区間ごとに周波数成分に分けること / それを速く計算する方法 |

## 全体の流れ

ピッチ変更は「時間伸縮」と「リサンプル」の組み合わせで行う（`dsp/src/pipeline.rs`）。

1. 音声を「伸縮率 × ピッチ比」の倍率で時間伸縮する（長さが変わり、高さは変わらない）
2. フォルマントを保持するときは、伸縮した音声のスペクトル包絡を補正する（[フォルマント補正](#フォルマント補正)）
3. ピッチ比の速さでリサンプルし、目的の長さに戻す（高さがピッチ比の分だけ変わる）

たとえば 1 オクターブ上げるときは、2 倍に伸ばしてから 2 倍速で読み直す。長さは元に戻り、高さだけが 2 倍になる。

リサンプルは、窓付き sinc 補間で行う（`wevocal-lib/src/resample.rs`）。速く読むときはカットオフを下げて、折り返しノイズ（高い音が低い音に化けること）を防ぐ。

## 時間伸縮

時間伸縮は 4 つの方式から選べる。どれも「出力の各位置が、入力のどこに当たるか」という時間の対応（`timemap.rs`）に沿って、入力から断片を取ってきて並べ直す。一定の倍率の伸縮も、時間ごとに倍率が変わる伸縮（ピッチカーブ）も、同じ仕組みで扱う。

| 方式 | ファイル | 仕組み | 向いているもの |
| --- | --- | --- | --- |
| PSOLA | `psola.rs` | 声の 1 周期ごとに切り貼りする | 声 |
| SOLA | `sola.rs` | 約 50ms の断片を、短いクロスフェードでつなぐ | 声・単音（ボーカルの既定） |
| WSOLA | `wsola.rs` | 約 46ms の断片を、半分ずつ重ねてつなぐ | 子音の多い音声。速い |
| PSOLAv2 | `psola.rs`（`Marking::Correlation`） | PSOLA の目印を、前の周期と最も似ている位置に置く | 声 |
| WSOLAv2 | `wsola.rs`（`wsola2_map`） | WSOLA の位置合わせを、正規化した相互相関で行う | 子音の多い音声 |
| Phase Vocoder | `pv.rs` | 周波数成分ごとに位相をそろえて伸ばす | 和音・楽器（楽器の既定） |

ステレオでは、全チャンネルで同じ切り貼りの位置を使う。チャンネルごとに位置がずれると、音の定位（左右の位置）が崩れるため。

### PSOLA（Pitch-Synchronous Overlap-Add）

1. 声の 1 周期ごとに目印（ピッチマーク）を置く。前の目印から約 1 周期先の、波形の山を探す
2. 目印を中心に、2 周期分を窓で切り出す
3. 出力の位置に合わせて、断片を 1 周期ずつずらして重ねる。伸ばすときは同じ断片を繰り返し、縮めるときは間引く

周期の区切りで切り貼りするので、伸ばしても声の周期の形が崩れにくい。息や子音など周期のない部分は一定間隔で切り出し、同じ断片の繰り返しがブザー音にならないよう、切り出す位置を少しずつずらす。

#### PSOLAv2（目印の置き方の改良）

従来の PSOLA は、予定位置の前後 ±30% で「いちばん大きいサンプル」を目印にしている。声の波形には同じくらいの高さの山が 1 周期に複数あることが多く、選ぶ山が周期ごとに入れ替わると、切り出す位相がずれてかすれた音になる。

PSOLAv2 は、声が続いている間は、前の目印を中心にした 1 周期分の波形と、候補の位置を中心にした波形の正規化相互相関が最大になる位置を目印にする。周期ごとに同じ位相の位置にそろう。声の始まりは比べる前の周期がないので、従来どおり最も大きい山にする。

TD-PSOLA の音質は目印（声門閉鎖の時点、GCI）の正確さで決まるとされ、候補を推定したピッチとの一致度で選ぶ方法や、自己相関・相互相関を組み合わせる方法が提案されている（参考資料 1〜3）。PSOLAv2 はそのうち、前の周期との相互相関で揃える部分だけを取り入れた簡単なもの。

### SOLA と WSOLA

どちらも、入力から一定の長さの断片を取ってきて、前の断片とつながりのよい位置を探して重ねる。

- **SOLA**: 重なりが短い（約 10ms）。重なる区間の 2 乗誤差が最も小さい位置を探す。にじみが少ない
- **WSOLA**: 断片の半分を重ねる。波形が最も似ている位置を探す。なめらかだが、少しにじむ

探す幅は約 12ms。約 83Hz までの低い声の、1 周期分をカバーする。

#### WSOLAv2（類似度の正規化）

従来の WSOLA は、前の断片の自然な続きと候補の内積（正規化しない相互相関）が最大になる位置を選ぶ。内積は波形が似ているかだけでなく音の大きさにも比例するので、「似ている位置」より「大きい位置」が選ばれやすく、位置合わせがずれて、にじみ・うなりになる。

WSOLAv2 は、内積を候補のエネルギーの平方根で割った値（正規化した相互相関。自然な続きの側は探索中に変わらないので割らなくてよい）で選ぶ。WSOLA の元の論文（参考資料 4）は、自然な続きと最もよく似た位置を、相互相関などの類似度で選ぶものとしている。

## 参考資料

PSOLAv2・WSOLAv2 を作るときに参照した（2026-10-02）。

1. [A two-phase pitch marking method for TD-PSOLA synthesis](https://www.researchgate.net/publication/221488978_A_two-phase_pitch_marking_method_for_TD-PSOLA_synthesis): 山・谷の候補を、推定したピッチとの一致度で選び、動的計画法で目印を決める
2. [Robust pitch marking for prosodic modification of speech using TD-PSOLA](https://www.researchgate.net/publication/228362180_Robust_pitch_marking_for_prosodic_modification_of_spech_using_TD-PSOLA): TD-PSOLA の音質は周期（エポック）の決め方に強く左右される
3. [An efficient and robust pitch marking algorithm on the speech waveform for TD-PSOLA](https://www.academia.edu/18002556/An_efficient_and_robust_pitch_marking_algorithm_on_the_speech_waveform_for_TD_PSOLA)
4. W. Verhelst, M. Roelands, [An overlap-add technique based on waveform similarity (WSOLA) for high quality time-scale modification of speech](https://www.semanticscholar.org/paper/An-overlap-add-technique-based-on-waveform-(WSOLA)-Verhelst-Roelands/d94abd77e52a56c425e4b86e6c7d692583ea406d), ICASSP 1993
5. [Audio time stretching and pitch scaling](https://en.wikipedia.org/wiki/Audio_time_stretching_and_pitch_scaling)（Wikipedia）: PSOLA は同じ断片の繰り返しでブザー音が出やすく、立ち上がりがにじみやすい。SOLA 系は単音には安く良い結果を出すが、和音には弱い

### Phase Vocoder

1. 音声を STFT で周波数成分に分ける
2. 出力のフレーム間隔に合わせて、各成分の位相（波のずれ）を進め直す
3. 逆 FFT で音声に戻し、重ねて足す

位相の進め方は identity phase locking（Laroche & Dolson）を使う。スペクトルの山の位相だけを計算し、周りの成分はその山と同じだけ回す。成分ごとにばらばらに回すより、残響のような感じ（フェージー感）が少ない。断片を繰り返さないので大きく伸ばしてもなめらかだが、音の立ち上がりは少しにじむ。

### 和音・楽器向けの候補（未実装）

和音・楽器向けは今 Phase Vocoder だけなので、足す候補を調べた (2026-10-02)。Phase Vocoder の弱点は、残響のような感じ（フェージー感）と、打楽器などの立ち上がり（トランジェント）のにじみ。

| 候補 | 仕組み | 効くところ | 入れ方 |
| --- | --- | --- | --- |
| Phase Vocoder ＋ 立ち上がり保持 | 立ち上がりを見つけたら、そこで位相を入力のものに戻す（位相のリセット）。Röbel の方式は、スペクトルの山ごとに群遅延で立ち上がりかどうかを判定し、立ち上がりの山だけを戻す。帯域ごとにまとめて戻す従来の方式は、同じ帯域を通る伸びている音の位相まで壊すため（参考資料 6） | 打楽器・ピアノ・ギターの立ち上がり | 今の `pv.rs` に足せる。小さい |
| 打楽器分離のハイブリッド（HPSS） | 音を「伸びる成分（和音など）」と「打つ成分（打楽器など）」に分け、前者は Phase Vocoder、後者は短い窓の OLA で伸ばして足し戻す。立ち上がりを見つける代わりに、分けることで暗に扱う（参考資料 7・8） | ドラム入りの曲 | 分離（スペクトログラムの横・縦方向のメディアンフィルタ）を足す。中くらい |
| PVSOLA | Phase Vocoder の出力に、相互相関で位置を合わせた入力のフレームをそのまま定期的に差し込み、位相のずれが溜まらないようにする。位相ロックが要らない。もとは単音の声向けで、和音向けの改良版もある（参考資料 9・10） | フェージー感 | 論文の方式なので自前で書ける。中くらい |
| Rubber Band Library | 時間伸縮とピッチ変更のライブラリ（参考資料 11） | 全般 | GPL（または有償の商用ライセンス）。組み込むならアプリ本体とは分けた追加機能にする |

まとめて比べた総説として参考資料 12 がある。

#### 参考資料（和音・楽器向け）

6. A. Röbel, [Transient detection and preservation in the phase vocoder](http://recherche.ircam.fr/anasyn/roebel/paper/icmc2003.pdf), ICMC 2003
7. J. Driedger, M. Müller, S. Ewert, [Improving Time-Scale Modification of Music Signals Using Harmonic-Percussive Separation](https://www.semanticscholar.org/paper/Improving-Time-Scale-Modification-of-Music-Signals-Driedger-M%C3%BCller/2936759a93ee6d6ce4109221bfbb08de0c7c569b), IEEE Signal Processing Letters 21, 2014
8. [libtsm](https://github.com/meinardmueller/libtsm): 上の HPSS の方式などを Python で実装した道具箱
9. A. Moinet, T. Dutoit, [PVSOLA: A Phase Vocoder with Synchronized OverLap-Add](http://recherche.ircam.fr/pub/dafx11/Papers/57_e.pdf), DAFx 2011
10. [Improved PVSOLA Time-Stretching and Pitch-Shifting for Polyphonic Audio](https://www.dafx12.york.ac.uk/papers/dafx12_submission_26.pdf), DAFx 2012: 正弦波の成分と雑音の成分を分けて、和音にも使えるようにする
11. [Rubber Band Library](https://breakfastquay.com/rubberband/)
12. J. Driedger, M. Müller, [A Review of Time-Scale Modification of Music Signals](https://mdpi.com/2076-3417/6/2/57/htm), Applied Sciences 6(2), 2016

## フォルマント補正

リサンプルは、フォルマントを含むスペクトル全体を一緒に動かしてしまう。そのままだとピッチを上げた声が細く（子どもっぽく）なる。そこで、リサンプルの **前** にスペクトル包絡を逆向きに変形しておき、リサンプル後に元の包絡に戻るようにする（`formant.rs`）。

1. フレームごとに対数スペクトルを求める
2. ケプストラム（対数スペクトルをもう一度周波数分解したもの）で細かい凹凸を取り除き、包絡 E(f) を求める
3. 包絡が E(c·f) になるように、周波数ごとの倍率を掛ける。c = ピッチ比 ÷ フォルマント比
4. リサンプルでスペクトルがピッチ比の分だけ動くと、包絡は E(f ÷ フォルマント比) になる

フォルマント比が 1 なら元の包絡のまま（保持）、1 以外なら声質だけが変わる。包絡の凹凸を取り除く幅は、フレームごとの声の周期に合わせて変える。低い声でも高い声でも、倍音だけを取り除けるようにするため。

フォルマントパネルで描いた曲線は、フレームごとに c を変えて同じ処理を行う（`formant::correct_varying`）。ピッチは変えない。

## ピッチカーブ編集

ピッチパネルで描いた目標のピッチは、時間ごとに変わるピッチ比 r(t) にして処理する（`curve.rs`）。

1. 入力の各時刻 t を r(t) 倍に伸ばす。伸ばした音声の中で、時刻 t は τ(t) = ∫r dt の位置に来る
2. 伸ばした音声を、位置 τ(t) から読み戻す（リサンプル）

長さは元のまま、時刻 t の高さだけが r(t) 倍になる。一定のピッチ変更と同じ「伸縮 → リサンプル」を、倍率が時間で変わる形に広げたもの。

画面側（`src/audio/pitchTools.ts`）の「平らにする」「音程に揃える」「ビブラート」「MIDI の音程を当てはめる」は、どれもこの目標のピッチの曲線を作るだけで、音声は「適用」のときにこの処理で作る。

## 解析

### F0 推定（YIN 法）

声の高さを 10ms ごとに推定する（`f0.rs`）。計算を軽くするため、16kHz に間引いてから行う。

1. 波形と、それを少しずらした波形との差（差分関数）を、ずらし幅ごとに求める
2. 差を、それまでの平均で割って正規化する
3. 正規化した差が閾値を下回った最初の谷を、1 周期とみなす

谷が浅い（はっきりした周期がない）フレームと、音が小さいフレームは、声がない（無声）として 0 にする。判定の厳しさと無音の閾値は、設定の「ピッチ解析」で変えられる。

### テンポ解析

BPM と 1 拍目の位置を推定する（`tempo.rs`）。

1. 短い区間ごとにスペクトルを求める
2. 各周波数で振幅が増えた分だけを足し合わせ、時刻ごとの「音の増え方」（オンセット強度）にする。音は主に拍の頭で鳴り始めるため
3. オンセット強度の、時間方向の周波数成分を BPM の候補ごとに求める。120 BPM なら 2Hz の成分が大きくなる
4. 選んだ BPM の成分の位相（波の山の位置）から、1 拍目の位置を求める

いちばん強い成分は、正しいテンポの 2 倍や半分になりやすい。そのため候補を強い順に複数返し、画面で選び直せるようにしている。

### スペクトログラム

表示用に、STFT の振幅を dB にして、対数の周波数軸の 128 段に割り当てる（`spec.rs`）。1 段 1 バイト（0〜255）に詰めて、メモリを抑える。

### ボーカル / 楽器の自動判定

ファイルを開いたとき、先頭の数十秒で F0 が取れたフレームの割合を見る（`src/audio/detectMode.ts`）。単音の声や楽器はピッチが取れやすく、和音やドラムは取れにくい。割合が高ければボーカル（SOLA ＋ フォルマント保持）、低ければ楽器（Phase Vocoder）にする。

## 画面側の処理

| 処理 | ファイル | 仕組み |
| --- | --- | --- |
| ループ試聴 | `src/audio/realtime/granularProcessor.ts` | 約 43ms の断片を半分ずつ重ねて鳴らす（グラニュラー方式）。断片の中はピッチ比の速さで読み、断片の読み始めは伸縮率に合わせて進める。音質は粗いが、スライダーの変更がすぐ反映される |
| 音声の作成 | `src/audio/synth.ts` | 楽器は基本の波形に音量の変化を付ける。声は倍音の多い波形に、母音ごとのフォルマント（F1〜F3）を強めるフィルターを重ねる |
| 音量の曲線 | `src/audio/edit.ts` | 描いた dB の曲線をフレーム間で直線補間し、サンプルごとに掛ける。再生中は Web Audio の音量の予約で同じ値を鳴らす |
| トラックの統合 | `src/audio/mix.ts` | ブラウザの OfflineAudioContext で足し合わせる。サンプルレートやチャンネル数の違いもブラウザが変換する |
| 範囲の継ぎ目 | `src/audio/edit.ts` | 加工した範囲を元に戻すとき、両端を 5ms のクロスフェードでつなぎ、プチッという音を防ぐ |

ボーカル抽出（Spleeter による分離）の仕組みは、[ボーカル抽出](EXTRACTOR.md) と、その先の WeVocalExtractor のドキュメントにある。

## 参考にした資料

| 資料 | 参考にしたところ |
| --- | --- |
| [タイムストレッチ・ピッチシフトのアルゴリズム](https://ackiesound.ifdef.jp/tech/timestretch.html) | 時間伸縮（断片を切り替えて、継ぎ目をクロスフェードでつなぐ方式）と、時間伸縮とリサンプルを組み合わせたピッチ変更の考え方。SOLA（`sola.rs`）の約 50ms のブロック・sin カーブのクロスフェード・2乗誤差での区切り位置の探索はこの記事のとおり。記事にあるゼロクロス点で区切る方式も試したが、2乗誤差より周期が崩れたので採らなかった（[決定事項](DECISIONS.md)） |
| [テンポ解析のアルゴリズム](https://ackiesound.ifdef.jp/doc/tempo/main.html) | スペクトルの音量の増加から、拍の周期に当たる周波数成分を求めてテンポを推定する手順（`tempo.rs`）。一番強い成分が 2 倍・半分になりやすいので候補を複数出し、タップでも測れるようにした点もこの記事に倣った |
| J. Laroche, M. Dolson, "Improved phase vocoder time-scale modification of audio" (1999) | Phase Vocoder の identity phase locking。各ビンに最寄りのピークと同じ位相の回し量を掛ける形にすると、三角関数がピークのビンだけで済む（`pv.rs` の高速化） |
| A. de Cheveigné, H. Kawahara, "YIN, a fundamental frequency estimator for speech and music" (2002) | F0 推定 |

次の2つは、資料を読んだのではなく一般的な手法として使ったもの。詳しく知りたいときの入口として挙げる。

| 手法 | 使っているところ | 載っている資料の例 |
| --- | --- | --- |
| 実数の信号 2 本を、1 回の複素 FFT の実部・虚部に詰めて同時に変換する | `pv.rs`（隣り合う 2 フレームをまとめて変換） | W. H. Press ほか, *Numerical Recipes*（実関数の FFT の節） |
| スペクトルの増加量（spectral flux）で音の立ち上がりの強さを測る | `tempo.rs` のオンセット強度 | J. P. Bello ほか, "A Tutorial on Onset Detection in Music Signals" (2005) |
