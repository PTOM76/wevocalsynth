//! identity phase locking（Laroche & Dolson）付き Phase Vocoder による時間伸縮。
//!
//! 大きな伸長でも WSOLA よりなめらか（断片の繰り返しがない）。その代わり
//! 多少の残響感（フェージー感）が出て、アタックがにじむ。
//!
//! Phase Vocoder v2（`stretch2` / `stretch_map2`）は立ち上がりを保つ。立ち上がりを含む分析フレームが
//! 出力の別々の場所に置かれるのがにじみの原因なので、立ち上がりのまわりだけ伸ばさずに等倍で進め、
//! 区間に入るところで位相を入力に戻す。伸ばさなかった分は、まわりの部分で取り戻す
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
/// 立ち上がり保持（Phase Vocoder v2）: スペクトルの増え方（フラックス）が平均 + この倍の標準偏差を超えた所を立ち上がりとみなす
const ONSET_SIGMA: f32 = 1.5;

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

/// 立ち上がりの位置（入力のサンプル）を見つける。モノラルにまとめた音のスペクトルの増え方（フラックス）が、
/// 平均 + `ONSET_SIGMA` × 標準偏差を超えて、前後より大きいフレーム
fn detect_onsets(channels: &[&[f32]], fft: &Fft, window: &[f32], n: usize, hop: usize) -> Vec<usize> {
    let len = channels[0].len();
    let bins = n / 2 + 1;
    let (mut re, mut im) = (vec![0.0f32; n], vec![0.0f32; n]);
    let mut prev = vec![0.0f32; bins];
    let mut flux = Vec::new();
    let mut pos = 0;
    while pos + n <= len {
        for i in 0..n {
            re[i] = channels.iter().map(|c| c[pos + i]).sum::<f32>() / channels.len() as f32 * window[i];
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        let mut f = 0.0f32;
        for b in 0..bins {
            let m = (re[b] * re[b] + im[b] * im[b]).sqrt();
            f += (m - prev[b]).max(0.0);
            prev[b] = m;
        }
        flux.push(f);
        pos += hop;
    }
    if flux.len() < 3 {
        return Vec::new();
    }
    let mean = flux.iter().sum::<f32>() / flux.len() as f32;
    let sd = (flux.iter().map(|f| (f - mean) * (f - mean)).sum::<f32>() / flux.len() as f32).sqrt();
    let th = mean + ONSET_SIGMA * sd;
    (1..flux.len() - 1)
        .filter(|&k| flux[k] > th && flux[k] >= flux[k - 1] && flux[k] > flux[k + 1])
        // 増え方が最大になるのは、立ち上がりが窓の中ほどに来たフレーム
        .map(|k| k * hop + n / 2)
        .collect()
}

/// 立ち上がりのまわりでは入力も合成ホップと同じ幅で進め（伸ばさない）、ずれた分はまわりの部分で取り戻す。
/// 窓が立ち上がりを含むフレーム（開始位置が 立ち上がり - n 〜 立ち上がり + n/4）を立ち上がりの区間とし、
/// 区間に入る最初のフレームで位相を入力に戻す（`reset`）
fn keep_transients(positions: &mut [usize], reset: &mut [bool], onsets: &[usize], n: usize, hs: usize, last_pos: usize) {
    if onsets.is_empty() || positions.len() < 2 {
        return;
    }
    let in_zone = |p: f64| onsets.iter().any(|&o| p > o as f64 - n as f64 && p < o as f64 + n as f64 / 4.0);
    let orig: Vec<f64> = positions.iter().map(|&p| p as f64).collect();
    let mut cur = orig[0];
    let mut was_in = false;
    for k in 1..positions.len() {
        let step = orig[k] - orig[k - 1];
        // 元の対応からのずれ（正なら先に進みすぎ）
        let debt = cur - orig[k - 1];
        let zone = in_zone(cur);
        let next = if zone {
            cur + hs as f64
        } else {
            // 区間の外では、ずれを 1 フレームあたり元の進み幅の半分までずつ取り戻す
            cur + (step - debt.clamp(-step * 0.5, step * 0.5)).max(0.0)
        };
        cur = next.clamp(0.0, last_pos as f64);
        positions[k] = cur.round() as usize;
        let now_in = in_zone(cur);
        reset[k] = now_in && !was_in;
        was_in = now_in;
    }
}

/// 任意の時間対応 `map` で全チャンネルを伸縮する。
pub fn stretch_map(
    channels: &[&[f32]],
    map: &TimeMap,
    sample_rate: f32,
    progress: &mut dyn FnMut(f64),
) -> Vec<Vec<f32>> {
    stretch_map_with(channels, map, sample_rate, false, progress)
}

/// 立ち上がり保持付き（Phase Vocoder v2）の `stretch`
pub fn stretch2(channels: &[&[f32]], alpha: f64, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    if (alpha - 1.0).abs() < 1e-9 {
        return channels.iter().map(|c| c.to_vec()).collect();
    }
    let out_len = (len as f64 * alpha).round() as usize;
    stretch_map_with(channels, &TimeMap::linear(len, out_len), sample_rate, true, progress)
}

/// 立ち上がり保持付き（Phase Vocoder v2）の `stretch_map`
pub fn stretch_map2(channels: &[&[f32]], map: &TimeMap, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<f32>> {
    stretch_map_with(channels, map, sample_rate, true, progress)
}

/// Phase Vocoder の本体。`transients` なら立ち上がりの山の位相を入力に戻す
fn stretch_map_with(
    channels: &[&[f32]],
    map: &TimeMap,
    sample_rate: f32,
    transients: bool,
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
    // 各出力フレームの入力の位置。立ち上がり保持なら、立ち上がりのまわりだけ伸ばさずに進める（`keep_transients`）
    let mut positions: Vec<usize> = (0..frames).map(|k| map.frame_pos(k * hs, len, n).round().clamp(0.0, last_pos) as usize).collect();
    // 位相を入力に戻すフレーム（立ち上がりの区間に入るところ）
    let mut reset = vec![false; frames];
    if transients {
        let onsets = detect_onsets(channels, &fft, &window, n, hs);
        keep_transients(&mut positions, &mut reset, &onsets, n, hs, last_pos as usize);
    }
    let pos_of = |k: usize| positions[k];

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
            // 立ち上がりの区間に入るフレームは、位相を進めずに入力のまま使う（以降は等倍で進むので、ほぼ元の波形になる）
            advance(&mut st, &xs[0], &mut ys[0], k == 0 || reset[k], pa.saturating_sub(prev_pos), hs, n, &mut peaks, &mut rot);
            if two {
                advance(&mut st, &xs[1], &mut ys[1], reset[k + 1], pb.saturating_sub(pa), hs, n, &mut peaks, &mut rot);
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
