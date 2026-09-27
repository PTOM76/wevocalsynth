//! identity phase locking（Laroche & Dolson）付き Phase Vocoder による時間伸縮。
//!
//! 大きな伸長でも WSOLA よりなめらか（断片の繰り返しがない）。その代わり
//! 多少の残響感（フェージー感）が出て、アタックがにじむ。

use crate::fft::Fft;
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
    let out_len = (len as f64 * alpha).round() as usize;
    if len == 0 || out_len == 0 {
        return vec![Vec::new(); channels.len()];
    }
    if (alpha - 1.0).abs() < 1e-9 {
        return channels.iter().map(|c| c.to_vec()).collect();
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

    // 末尾の扱いは WSOLA と同じ: 最後の出力フレームを最後の入力フレームに対応づけ、
    // 入力の外を読まないようにする。
    let last_pos = len.saturating_sub(n) as f64;
    let span_out = out_len.saturating_sub(n).max(1) as f64;
    let frames = out_len / hs + 1;
    let pos_of = |k: usize| {
        ((k * hs) as f64 / span_out * last_pos)
            .round()
            .clamp(0.0, last_pos) as usize
    };

    let total = (frames * channels.len()).max(1) as f64;
    let mut out = vec![vec![0.0f32; out_len + n]; channels.len()];
    let mut norm = vec![0.0f32; out_len + n];
    for k in 0..frames {
        for (i, &w) in window.iter().enumerate() {
            norm[k * hs + i] += w * w;
        }
    }

    let (mut re, mut im) = (vec![0.0f32; n], vec![0.0f32; n]);
    let mut mag = vec![0.0f32; bins];
    let mut phase = vec![0.0f64; bins];
    let mut prev_phase = vec![0.0f64; bins];
    let mut out_phase = vec![0.0f64; bins];
    // ビンごとの直近の瞬時周波数（rad/sample）。入力の末尾で分析位置が
    // 動かなくなったフレームで使い回す。
    let mut inst = vec![0.0f64; bins];
    let mut peaks: Vec<usize> = Vec::with_capacity(bins);

    for (ci, x) in channels.iter().enumerate() {
        let mut prev_pos = 0usize;
        for (b, f) in inst.iter_mut().enumerate() {
            *f = 2.0 * PI * b as f64 / n as f64;
        }
        for k in 0..frames {
            if k % 256 == 0 {
                progress((ci * frames + k) as f64 / total);
            }
            let pos = pos_of(k);
            for i in 0..n {
                re[i] = x.get(pos + i).copied().unwrap_or(0.0) * window[i];
                im[i] = 0.0;
            }
            fft.run(&mut re, &mut im, false);
            for b in 0..bins {
                mag[b] = (re[b] * re[b] + im[b] * im[b]).sqrt();
                phase[b] = (im[b] as f64).atan2(re[b] as f64);
            }

            if k == 0 {
                out_phase.copy_from_slice(&phase);
            } else {
                // 実際の分析ホップから瞬時周波数を求め、合成ホップ分だけ位相を進める
                // （ピークのビンのみ）。
                let hop = pos - prev_pos;
                peaks.clear();
                for b in 1..bins - 1 {
                    if mag[b] > mag[b - 1] && mag[b] >= mag[b + 1] {
                        peaks.push(b);
                    }
                }
                if peaks.is_empty() {
                    peaks.push(0);
                }
                let mut new_phase = out_phase.clone();
                for &p in &peaks {
                    if hop > 0 {
                        let ha = hop as f64;
                        let omega = 2.0 * PI * p as f64 / n as f64;
                        inst[p] = omega + wrap(phase[p] - prev_phase[p] - omega * ha) / ha;
                    }
                    new_phase[p] = out_phase[p] + inst[p] * hs as f64;
                }
                // identity phase locking: 各ビンは最寄りのピークとの位相差を保つ
                // （境界はピーク間の中点）。
                let mut pi = 0;
                for b in 0..bins {
                    while pi + 1 < peaks.len() && b > (peaks[pi] + peaks[pi + 1]) / 2 {
                        pi += 1;
                    }
                    let p = peaks[pi];
                    if b != p {
                        new_phase[b] = new_phase[p] + phase[b] - phase[p];
                    }
                }
                out_phase = new_phase;
            }
            prev_phase.copy_from_slice(&phase);
            prev_pos = pos;

            // エルミート対称なスペクトルを組み直して逆変換する。
            for b in 0..bins {
                let (s, c) = out_phase[b].sin_cos();
                re[b] = mag[b] * c as f32;
                im[b] = mag[b] * s as f32;
            }
            for b in bins..n {
                re[b] = re[n - b];
                im[b] = -im[n - b];
            }
            fft.run(&mut re, &mut im, true);
            let o = &mut out[ci];
            let scale = 1.0 / n as f32;
            for i in 0..n {
                o[k * hs + i] += re[i] * scale * window[i];
            }
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
