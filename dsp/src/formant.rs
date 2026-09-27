//! Spectral envelope (formant) correction.
//!
//! Pitch shifting here is "stretch, then resample by r", and resampling moves
//! the whole spectrum — formants included — by r. To keep (or move) formants
//! independently, the stretched signal is filtered frame by frame *before*
//! resampling so that its envelope becomes E(c·f), where E is the frame's own
//! envelope and c = pitch_ratio / formant_ratio. After resampling by r the
//! envelope lands at E(f / formant_ratio): unchanged when formant_ratio = 1.
//!
//! The envelope is a cepstrally smoothed log spectrum. The lifter cutoff
//! follows the frame's pitch period (cepstral peak) so harmonics are smoothed
//! away for both low and high voices.

use crate::fft::Fft;
use std::f64::consts::PI;

const FRAME_SEC: f32 = 0.046;
const OVERLAP: usize = 4;
/// Pitch search range for the lifter cutoff.
const F0_MIN: f32 = 60.0;
const F0_MAX: f32 = 1000.0;
/// Lifter cutoff as a fraction of the pitch period.
const LIFTER_RATIO: f32 = 0.6;
/// Max correction per bin (natural log): about ±26 dB.
const MAX_LOG_GAIN: f32 = 3.0;

/// Filter `x` so its spectral envelope becomes E(c·f). `c == 1` is a no-op.
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

    // Frames start one frame before the signal so the edges get full overlap.
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
        let o = (start + n as i64) as usize; // index into `out` (offset by n)
        if energy < 1e-10 {
            // Silence: nothing to correct, just keep the window sum consistent.
            for i in 0..n {
                out[o + i] += re[i] * window[i];
                norm[o + i] += window[i] * window[i];
            }
            continue;
        }
        fft.run(&mut re, &mut im, false);

        // Real cepstrum of the log magnitude.
        for b in 0..n {
            cre[b] = ((re[b] * re[b] + im[b] * im[b]).sqrt() + 1e-9).ln();
            cim[b] = 0.0;
        }
        fft.run(&mut cre, &mut cim, true);
        let scale = 1.0 / n as f32;

        // Lifter cutoff from the pitch period (strongest cepstral peak).
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

        // Gain that turns E(f) into E(c·f), linear interpolation between bins.
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
