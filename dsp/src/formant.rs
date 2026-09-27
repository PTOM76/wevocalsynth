//! スペクトル包絡（フォルマント）補正。
//!
//! 本エンジンのピッチ変更は「伸縮してから r 倍速でリサンプル」であり、リサンプルは
//! フォルマントを含むスペクトル全体を r 倍に動かしてしまう。フォルマントを保持（または
//! 独立に移動）するため、リサンプル *前* の伸縮済み信号をフレームごとにフィルタし、
//! 包絡を E(c·f) に変形しておく。E はそのフレーム自身の包絡、
//! c = ピッチ比 / フォルマント比。r 倍のリサンプル後、包絡は E(f / フォルマント比) となり、
//! フォルマント比 = 1 なら元の包絡のまま保たれる。
//!
//! 包絡はケプストラムで平滑化した対数スペクトル。リフタのカットオフはフレームごとの
//! ピッチ周期（ケプストラムのピーク）に追従させ、低い声でも高い声でも倍音成分を
//! 取り除けるようにしている。

use crate::fft::Fft;
use std::f64::consts::PI;

const FRAME_SEC: f32 = 0.046;
const OVERLAP: usize = 4;
/// リフタのカットオフを決めるためのピッチ探索範囲。
const F0_MIN: f32 = 60.0;
const F0_MAX: f32 = 1000.0;
/// リフタのカットオフ（ピッチ周期に対する比率）。
const LIFTER_RATIO: f32 = 0.6;
/// ビンごとの最大補正量（自然対数）。約 ±26 dB。
const MAX_LOG_GAIN: f32 = 3.0;

/// `x` のスペクトル包絡が E(c·f) になるようフィルタする。`c == 1` なら何もしない。
pub fn correct(x: &[f32], c: f64, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<f32> {
    let len = x.len();
    if len == 0 || (c - 1.0).abs() < 1e-9 {
        return x.to_vec();
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
    let q_min = (sample_rate / F0_MAX) as usize;
    let q_max = ((sample_rate / F0_MIN) as usize).min(n / 2 - 1);
    let default_cut = (sample_rate * 0.0015) as usize;

    // 端でもオーバーラップが揃うよう、フレームは信号の1フレーム手前から始める。
    let frames = (len + n) / hs + 1;
    let mut out = vec![0.0f32; len + 2 * n];
    let mut norm = vec![0.0f32; len + 2 * n];
    let (mut re, mut im) = (vec![0.0f32; n], vec![0.0f32; n]);
    let (mut cre, mut cim) = (vec![0.0f32; n], vec![0.0f32; n]);
    let mut env = vec![0.0f32; bins];

    for k in 0..frames {
        if k % 256 == 0 {
            progress(k as f64 / frames as f64);
        }
        let start = (k * hs) as i64 - n as i64;
        let mut energy = 0.0f32;
        for i in 0..n {
            let s = start + i as i64;
            let v = if s >= 0 && (s as usize) < len {
                x[s as usize]
            } else {
                0.0
            };
            re[i] = v * window[i];
            im[i] = 0.0;
            energy += re[i] * re[i];
        }
        let o = (start + n as i64) as usize; // `out` 上の位置（n だけずらしてある）
        if energy < 1e-10 {
            // 無音: 補正は不要。窓の総和だけは揃えておく。
            for i in 0..n {
                out[o + i] += re[i] * window[i];
                norm[o + i] += window[i] * window[i];
            }
            continue;
        }
        fft.run(&mut re, &mut im, false);

        // 対数振幅の実ケプストラム。
        for b in 0..n {
            cre[b] = ((re[b] * re[b] + im[b] * im[b]).sqrt() + 1e-9).ln();
            cim[b] = 0.0;
        }
        fft.run(&mut cre, &mut cim, true);
        let scale = 1.0 / n as f32;

        // ピッチ周期（最も強いケプストラムのピーク）からリフタのカットオフを決める。
        let mut peak_q = 0;
        let mut peak_v = 0.0f32;
        for q in q_min..=q_max {
            if cre[q] > peak_v {
                peak_v = cre[q];
                peak_q = q;
            }
        }
        let cut = if peak_q > 0 && peak_v * scale > 0.05 {
            ((peak_q as f32 * LIFTER_RATIO) as usize).max(4)
        } else {
            default_cut
        };
        for q in 0..n {
            let d = q.min(n - q);
            let keep = if d < cut {
                1.0
            } else if d == cut {
                0.5
            } else {
                0.0
            };
            cre[q] *= keep * scale;
            cim[q] = 0.0;
        }
        fft.run(&mut cre, &mut cim, false);
        env.copy_from_slice(&cre[..bins]);

        // E(f) を E(c·f) に変えるゲイン。ビン間は線形補間。
        for b in 0..bins {
            let t = b as f64 * c;
            let target = if t >= (bins - 1) as f64 {
                env[bins - 1]
            } else {
                let i = t.floor() as usize;
                let g = (t - i as f64) as f32;
                env[i] + (env[i + 1] - env[i]) * g
            };
            let gain = (target - env[b]).clamp(-MAX_LOG_GAIN, MAX_LOG_GAIN).exp();
            re[b] *= gain;
            im[b] *= gain;
            if b > 0 && b < n / 2 {
                re[n - b] *= gain;
                im[n - b] *= gain;
            }
        }
        fft.run(&mut re, &mut im, true);
        for i in 0..n {
            out[o + i] += re[i] * scale * window[i];
            norm[o + i] += window[i] * window[i];
        }
    }

    out[n..n + len]
        .iter()
        .zip(&norm[n..n + len])
        .map(|(&v, &w)| if w > 1e-3 { v / w } else { 0.0 })
        .collect()
}
