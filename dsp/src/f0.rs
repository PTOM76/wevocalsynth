//! YIN 法による基本周波数（F0）推定。
//!
//! 計算量を抑えるため 16kHz に間引いてから、10ms ごとに推定する。
//! 無声・無音のフレームは 0 を返す。

use crate::resample;

/// 解析用のサンプルレート。
const ANALYSIS_RATE: f32 = 16000.0;
/// 推定する間隔（秒）。
pub const HOP_SEC: f32 = 0.01;
/// 差分関数を積分する窓長（秒）。
const WINDOW_SEC: f32 = 0.025;
const F0_MIN: f32 = 60.0;
const F0_MAX: f32 = 1000.0;
/// 累積平均正規化差分がこの値を下回った最初の谷を周期とみなす。
const THRESHOLD: f32 = 0.15;
/// これより小さい谷しか見つからないフレームは無声とする。
const VOICED_LIMIT: f32 = 0.35;
/// 無音判定の RMS（約 -50dB）。
const SILENCE_RMS: f32 = 0.003;

/// モノラル信号 `x` の F0 を `HOP_SEC` 間隔で推定する。k 番目の値は時刻 k × HOP_SEC の推定値（Hz、無声は 0）。
pub fn estimate(x: &[f32], sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<f32> {
    if x.is_empty() {
        return Vec::new();
    }
    let ratio = (sample_rate / ANALYSIS_RATE) as f64;
    let ds_len = (x.len() as f64 / ratio).round() as usize;
    let y = if (ratio - 1.0).abs() < 1e-9 { x.to_vec() } else { resample(x, ratio, ds_len) };

    let sr = ANALYSIS_RATE;
    let hop = (sr * HOP_SEC) as usize;
    let w = (sr * WINDOW_SEC) as usize;
    let tau_min = (sr / F0_MAX) as usize;
    let tau_max = (sr / F0_MIN) as usize;
    let frames = y.len() / hop + 1;

    // フレーム中心を時刻に合わせるため、前後をゼロ詰めする。
    let pad = w / 2 + tau_max + 1;
    let mut buf = vec![0.0f32; pad + y.len() + pad + w];
    buf[pad..pad + y.len()].copy_from_slice(&y);

    let mut d = vec![0.0f32; tau_max + 2];
    let mut out = Vec::with_capacity(frames);
    for k in 0..frames {
        if k % 500 == 0 {
            progress(k as f64 / frames as f64);
        }
        let start = pad + k * hop - w / 2;
        let frame = &buf[start..start + w + tau_max + 1];

        let energy: f32 = frame[..w].iter().map(|v| v * v).sum();
        if (energy / w as f32).sqrt() < SILENCE_RMS {
            out.push(0.0);
            continue;
        }

        // 差分関数 d(τ) と累積平均正規化差分 d'(τ)。
        d[0] = 1.0;
        let mut running = 0.0f32;
        for tau in 1..=tau_max {
            let mut s = 0.0f32;
            for j in 0..w {
                let diff = frame[j] - frame[j + tau];
                s += diff * diff;
            }
            running += s;
            d[tau] = if running > 0.0 { s * tau as f32 / running } else { 1.0 };
        }

        // 閾値を下回った最初の谷を採用し、なければ全体の最小値を候補にする。
        let mut best = None;
        let mut tau = tau_min;
        while tau < tau_max {
            if d[tau] < THRESHOLD {
                while tau + 1 < tau_max && d[tau + 1] < d[tau] {
                    tau += 1;
                }
                best = Some(tau);
                break;
            }
            tau += 1;
        }
        let tau = best.unwrap_or_else(|| {
            (tau_min..tau_max).min_by(|&a, &b| d[a].total_cmp(&d[b])).unwrap_or(tau_min)
        });
        if d[tau] > VOICED_LIMIT {
            out.push(0.0);
            continue;
        }

        // 放物線補間で周期を小数精度にする。
        let (a, b, c) = (d[tau - 1], d[tau], d[tau + 1]);
        let denom = a - 2.0 * b + c;
        let shift = if denom.abs() > 1e-12 { 0.5 * (a - c) / denom } else { 0.0 };
        out.push(sr / (tau as f32 + shift.clamp(-1.0, 1.0)));
    }
    progress(1.0);
    out
}
