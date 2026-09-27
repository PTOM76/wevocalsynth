//! Phase vocoder time stretch with identity phase locking (Laroche & Dolson).
//!
//! Smoother than WSOLA on long stretches (no grain repetition), at the cost
//! of some phasiness and softened transients.

use std::f64::consts::PI;

/// Analysis/synthesis frame length in seconds; rounded up to a power of two.
const FRAME_SEC: f32 = 0.046;
/// Synthesis hop as a fraction of the frame (75% overlap).
const OVERLAP: usize = 4;

/// In-place iterative radix-2 FFT over split real/imag arrays.
struct Fft {
    n: usize,
    cos: Vec<f32>,
    sin: Vec<f32>,
    rev: Vec<usize>,
}

impl Fft {
    fn new(n: usize) -> Self {
        let bits = n.trailing_zeros();
        let rev = (0..n).map(|i| i.reverse_bits() >> (usize::BITS - bits)).collect();
        let cos = (0..n / 2).map(|i| (2.0 * PI * i as f64 / n as f64).cos() as f32).collect();
        let sin = (0..n / 2).map(|i| (2.0 * PI * i as f64 / n as f64).sin() as f32).collect();
        Fft { n, cos, sin, rev }
    }

    /// Forward transform when `inverse` is false; the inverse is unscaled.
    fn run(&self, re: &mut [f32], im: &mut [f32], inverse: bool) {
        let n = self.n;
        for i in 0..n {
            let j = self.rev[i];
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let sign = if inverse { 1.0 } else { -1.0 };
        let mut size = 2;
        while size <= n {
            let half = size / 2;
            let step = n / size;
            for start in (0..n).step_by(size) {
                for k in 0..half {
                    let (wr, wi) = (self.cos[k * step], sign * self.sin[k * step]);
                    let (a, b) = (start + k, start + k + half);
                    let tr = re[b] * wr - im[b] * wi;
                    let ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            size *= 2;
        }
    }
}

fn wrap(p: f64) -> f64 {
    p - 2.0 * PI * ((p + PI) / (2.0 * PI)).floor()
}

/// Time-stretch all channels by `alpha` (output length = input length * alpha).
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

    let n = ((sample_rate * FRAME_SEC) as usize).max(256).next_power_of_two();
    let hs = n / OVERLAP;
    let bins = n / 2 + 1;
    let fft = Fft::new(n);
    let window: Vec<f32> = (0..n)
        .map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / n as f64).cos()) as f32)
        .collect();

    // Same end handling as WSOLA: map the last output frame onto the last
    // input frame so frames never read past the input.
    let last_pos = len.saturating_sub(n) as f64;
    let span_out = out_len.saturating_sub(n).max(1) as f64;
    let frames = out_len / hs + 1;
    let pos_of = |k: usize| ((k * hs) as f64 / span_out * last_pos).round().clamp(0.0, last_pos) as usize;

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
    // Last instantaneous frequency (rad/sample) per bin, reused when the
    // analysis position does not move (clamped at the end of the input).
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
                // Instantaneous frequency from the actual analysis hop, then
                // advance by the synthesis hop (peaks only).
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
                // Identity phase locking: each bin keeps its phase offset to
                // the nearest peak (boundary halfway between peaks).
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

            // Rebuild a Hermitian spectrum and inverse transform.
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
