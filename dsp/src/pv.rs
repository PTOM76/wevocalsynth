//! identity phase locking（Laroche & Dolson）付き Phase Vocoder による時間伸縮。
//!
//! 大きな伸長でも WSOLA よりなめらか（断片の繰り返しがない）。その代わり
//! 多少の残響感（フェージー感）が出て、アタックがにじむ。
//!
//! 速くするための工夫（結果は素直な実装と同じ）:
//! - identity phase locking は「各ビンに、最寄りのピークの位相の回し量を複素数で掛ける」形で行う。
//!   三角関数（atan2・sin/cos）はピークのビンだけで済み、全ビンで求めなくてよい
//! - 同じチャンネルの隣り合う2フレームを、実部と虚部に詰めて1回の複素 FFT でまとめて変換する

use crate::fft::Fft;
use crate::TimeMap;
use std::f64::consts::PI;

/// 分析・合成フレーム長（秒）。2のべき乗に切り上げる。
const FRAME_SEC: f32 = 0.046;
/// 合成ホップ = フレーム長 / この値（75% オーバーラップ）。
const OVERLAP: usize = 4;

fn wrap(p: f64) -> f64 {
    p - 2.0 * PI * ((p + PI) / (2.0 * PI)).floor()
}

/// 全チャンネルを `alpha` 倍に時間伸縮する（出力長 = 入力長 × alpha）。
pub fn stretch(
    channels: &[&[f32]],
    alpha: f64,
    sample_rate: f32,
    progress: &mut dyn FnMut(f64),
) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    if (alpha - 1.0).abs() < 1e-9 {
        return channels.iter().map(|c| c.to_vec()).collect();
    }
    let out_len = (len as f64 * alpha).round() as usize;
    stretch_map(
        channels,
        &TimeMap::linear(len, out_len),
        sample_rate,
        progress,
    )
}

/// 1チャンネルぶんの、フレームをまたいで持ち越す状態
struct ChannelState {
    /// 前のフレームの入力スペクトルと出力スペクトル（ビンごとの複素数）
    prev_x: Vec<(f32, f32)>,
    prev_y: Vec<(f32, f32)>,
    /// ビンごとの直近の瞬時周波数（rad/sample）。入力の末尾で分析位置が動かなくなったフレームで使い回す。
    inst: Vec<f64>,
}

impl ChannelState {
    fn new(bins: usize, n: usize) -> Self {
        ChannelState {
            prev_x: vec![(0.0, 0.0); bins],
            prev_y: vec![(0.0, 0.0); bins],
            inst: (0..bins).map(|b| 2.0 * PI * b as f64 / n as f64).collect(),
        }
    }
}

/// 1チャンネルの入力スペクトル `x` から出力スペクトル `y` を作る（位相を合成ホップ分進める）
#[allow(clippy::too_many_arguments)]
fn advance(
    st: &mut ChannelState,
    x: &[(f32, f32)],
    y: &mut [(f32, f32)],
    first: bool,
    hop: usize,
    hs: usize,
    n: usize,
    peaks: &mut Vec<usize>,
    rot: &mut Vec<(f32, f32)>,
) {
    let bins = x.len();
    if first {
        y.copy_from_slice(x);
    } else {
        let mag2 = |b: usize| x[b].0 * x[b].0 + x[b].1 * x[b].1;

        peaks.clear();
        for b in 1..bins - 1 {
            let m = mag2(b);
            if m > mag2(b - 1) && m >= mag2(b + 1) {
                peaks.push(b);
            }
        }
        if peaks.is_empty() {
            peaks.push(0);
        }
        // ピークごとに、入力の位相から出力の位相への回し量 e^{i(出力位相 - 入力位相)} を求める
        rot.clear();
        for &p in peaks.iter() {
            // 三角関数は f32 で求める（位相の精度は f32 で足り、ピークの数だけ呼ぶので f64 より速い方がよい）
            let phase = x[p].1.atan2(x[p].0) as f64;
            if hop > 0 {
                let ha = hop as f64;
                let omega = 2.0 * PI * p as f64 / n as f64;
                let prev_phase = st.prev_x[p].1.atan2(st.prev_x[p].0) as f64;
                st.inst[p] = omega + wrap(phase - prev_phase - omega * ha) / ha;
            }
            let out_prev = st.prev_y[p].1.atan2(st.prev_y[p].0) as f64;
            // 回す角度は大きくなりうるので f64 で -π〜π に畳んでから f32 にする
            let (s, c) = (wrap(out_prev + st.inst[p] * hs as f64 - phase) as f32).sin_cos();
            rot.push((c, s));
        }
        // identity phase locking: 各ビンは最寄りのピーク（境界はピーク間の中点）と同じだけ位相を回す
        let mut pi = 0;
        for b in 0..bins {
            while pi + 1 < peaks.len() && b > (peaks[pi] + peaks[pi + 1]) / 2 {
                pi += 1;
            }
            let (c, s) = rot[pi];
            let (xr, xi) = x[b];
            y[b] = (xr * c - xi * s, xr * s + xi * c);
        }
    }
    st.prev_x.copy_from_slice(x);
    st.prev_y.copy_from_slice(y);
}

/// 任意の時間対応 `map` で全チャンネルを伸縮する。
pub fn stretch_map(
    channels: &[&[f32]],
    map: &TimeMap,
    sample_rate: f32,
    progress: &mut dyn FnMut(f64),
) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    let out_len = map.out_len;
    if len == 0 || out_len == 0 {
        return vec![Vec::new(); channels.len()];
    }

    let n = ((sample_rate * FRAME_SEC) as usize)
        .max(256)
        .next_power_of_two();
    let hs = n / OVERLAP;
    let bins = n / 2 + 1;
    let fft = Fft::new(n);
    let window: Vec<f32> = (0..n)
        .map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / n as f64).cos()) as f32)
        .collect();

    // 末尾の扱いは WSOLA と同じ（`TimeMap::frame_pos` 参照）。
    let last_pos = len.saturating_sub(n) as f64;
    let frames = out_len / hs + 1;
    let pos_of = |k: usize| map.frame_pos(k * hs, len, n).round().clamp(0.0, last_pos) as usize;

    let mut out = vec![vec![0.0f32; out_len + n]; channels.len()];
    let mut norm = vec![0.0f32; out_len + n];
    for k in 0..frames {
        for (i, &w) in window.iter().enumerate() {
            norm[k * hs + i] += w * w;
        }
    }

    let (mut re, mut im) = (vec![0.0f32; n], vec![0.0f32; n]);
    let mut xs = [vec![(0.0f32, 0.0f32); bins], vec![(0.0f32, 0.0f32); bins]];
    let mut ys = [vec![(0.0f32, 0.0f32); bins], vec![(0.0f32, 0.0f32); bins]];
    let mut peaks: Vec<usize> = Vec::with_capacity(bins);
    let mut rot: Vec<(f32, f32)> = Vec::with_capacity(bins);
    let total = (frames * channels.len()).max(1) as f64;
    let scale = 1.0 / n as f32;

    for (ci, x) in channels.iter().enumerate() {
        let mut st = ChannelState::new(bins, n);
        let mut prev_pos = 0usize;
        // 同じチャンネルの隣り合う2フレームを、実部と虚部に詰めて1回の FFT で変換する
        // （違うチャンネル同士を詰めると、大きな雑音の計算誤差が相方の静かな帯域に漏れて結果が揺れた）
        let mut k = 0;
        while k < frames {
            if k % 256 < 2 {
                progress((ci * frames + k) as f64 / total);
            }
            let two = k + 1 < frames;
            let (pa, pb) = (pos_of(k), if two { pos_of(k + 1) } else { 0 });
            for i in 0..n {
                re[i] = x.get(pa + i).copied().unwrap_or(0.0) * window[i];
                im[i] = if two { x.get(pb + i).copied().unwrap_or(0.0) * window[i] } else { 0.0 };
            }
            fft.run(&mut re, &mut im, false);
            // Z = X0 + i·X1 から、実信号2本のスペクトル X0・X1 を取り出す
            for bi in 0..bins {
                let j = (n - bi) % n;
                let (zr, zi, wr, wi) = (re[bi], im[bi], re[j], im[j]);
                xs[0][bi] = ((zr + wr) * 0.5, (zi - wi) * 0.5);
                xs[1][bi] = ((zi + wi) * 0.5, (wr - zr) * 0.5);
            }
            advance(&mut st, &xs[0], &mut ys[0], k == 0, pa - prev_pos, hs, n, &mut peaks, &mut rot);
            if two {
                advance(&mut st, &xs[1], &mut ys[1], false, pb - pa, hs, n, &mut peaks, &mut rot);
            }
            prev_pos = if two { pb } else { pa };

            // エルミート対称な2本のスペクトル Y0・Y1 を Y0 + i·Y1 にまとめて逆変換する（実部が k、虚部が k+1 のフレーム）。
            // 位相を回すと直流とナイキストのビンに虚部が付くが、実信号ではこれは捨てる分（1本ずつ変換すれば
            // 逆変換の虚部に出て捨てられる）。まとめると相方に漏れるので、先に実数にしておく
            for y in ys.iter_mut() {
                y[0].1 = 0.0;
                y[bins - 1].1 = 0.0;
            }
            for bi in 0..n {
                let (y0, y1) = if bi < bins {
                    (ys[0][bi], if two { ys[1][bi] } else { (0.0, 0.0) })
                } else {
                    let (p, q) = (ys[0][n - bi], if two { ys[1][n - bi] } else { (0.0, 0.0) });
                    ((p.0, -p.1), (q.0, -q.1))
                };
                re[bi] = y0.0 - y1.1;
                im[bi] = y0.1 + y1.0;
            }
            fft.run(&mut re, &mut im, true);
            let o = &mut out[ci];
            for i in 0..n {
                let w = scale * window[i];
                o[k * hs + i] += re[i] * w;
                if two {
                    o[(k + 1) * hs + i] += im[i] * w;
                }
            }
            k += 2;
        }
    }

    for o in out.iter_mut() {
        o.truncate(out_len);
        for (s, &w) in o.iter_mut().zip(&norm) {
            *s = if w > 1e-3 { *s / w } else { 0.0 };
        }
    }
    out
}
