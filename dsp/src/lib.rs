//! WeVocalSynth DSP engine.
//!
//! Time stretch: WSOLA (Waveform Similarity Overlap-Add) or a phase-locked
//! phase vocoder (see `pv`), selected per call.
//! Pitch shift: WSOLA stretch by the pitch ratio, then band-limited resampling
//! back to the target length. Duration is therefore independent of pitch.
//!
//! The wasm build exposes a tiny C ABI (no wasm-bindgen) so it can be loaded
//! with plain `WebAssembly.instantiate` inside a Web Worker.

mod fft;
pub mod formant;
pub mod pv;

use std::cell::RefCell;
use std::f64::consts::PI;

/// Analysis frame length in seconds (~46ms: long enough for low voices).
const FRAME_SEC: f32 = 0.046;
/// Search tolerance in seconds (~12ms: covers one pitch period down to ~83Hz).
const TOLERANCE_SEC: f32 = 0.012;

/// Time-stretch all channels by `alpha` (output length = input length * alpha).
/// Channels share the same frame positions so the stereo image stays coherent.
pub fn wsola(channels: &[&[f32]], alpha: f64, sample_rate: f32) -> Vec<Vec<f32>> {
    wsola_with_progress(channels, alpha, sample_rate, &mut |_| {})
}

/// `wsola` that reports progress in 0..=1 through `progress`.
pub fn wsola_with_progress(
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

    let mut n = ((sample_rate * FRAME_SEC) as usize).max(64);
    n += n % 2;
    let hs = n / 2;
    let delta = ((sample_rate * TOLERANCE_SEC) as i64).max(8);
    // Periodic Hann: sums to exactly 1 at 50% overlap.
    let window: Vec<f32> = (0..n)
        .map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / n as f64).cos()) as f32)
        .collect();

    // Zero-padded mono mix so correlation can use plain slices without bounds logic.
    let pad_l = delta as usize + 8;
    let pad_r = n + hs + delta as usize + 8;
    let mut mono = vec![0.0f32; pad_l + len + pad_r];
    for c in channels {
        for (m, &v) in mono[pad_l..pad_l + len].iter_mut().zip(c.iter()) {
            *m += v / channels.len() as f32;
        }
    }
    let max_pos = (len + hs + delta as usize) as i64;
    let seg = |p: i64| -> &[f32] {
        let s = (p.clamp(-(delta + 4), max_pos) + pad_l as i64) as usize;
        &mono[s..s + n]
    };
    // Similarity over the overlap region only (first half of each frame).
    let corr = |a: i64, b: i64, step: usize| -> f32 {
        seg(a)[..hs]
            .iter()
            .step_by(step)
            .zip(seg(b)[..hs].iter().step_by(step))
            .map(|(x, y)| x * y)
            .sum()
    };

    let mut out = vec![vec![0.0f32; out_len + n]; channels.len()];
    let mut wsum = vec![0.0f32; out_len + n];
    let frames = out_len / hs + 1;
    let mut prev_pos: i64 = 0;
    // Frames must lie fully inside the input: near the end a frame that runs
    // past the last sample would overlap-add silence and make the tail choppy.
    let last_pos = len.saturating_sub(n) as i64;
    let clamp_pos = |p: i64| p.clamp(0, last_pos);

    for k in 0..frames {
        if k % 256 == 0 {
            progress(k as f64 / frames as f64);
        }
        let out_start = k * hs;
        let pos = if k == 0 {
            0
        } else {
            // Map output frame starts onto input frame starts so the last input
            // frame is reached exactly at the last output frame. Plain
            // `out_start / alpha` overshoots near the end, leaving frames stuck
            // on the final grain and repeating it (an audible buzz).
            let span_out = out_len.saturating_sub(n).max(1) as f64;
            let nominal = ((out_start as f64 / span_out) * last_pos as f64).round() as i64;
            // Natural continuation of the previous frame: the part that overlaps
            // the new frame. prev_pos <= last_pos keeps it inside the input.
            let natural = prev_pos + hs as i64;
            // Coarse search, then refine around the best candidate.
            let (mut best, mut best_c) = (nominal, f32::MIN);
            let mut off = -delta;
            while off <= delta {
                let cand = clamp_pos(nominal + off);
                let c = corr(natural, cand, 8);
                if c > best_c {
                    best_c = c;
                    best = cand;
                }
                off += 4;
            }
            let coarse = best;
            best_c = f32::MIN;
            for off in -3..=3 {
                let cand = clamp_pos(coarse + off);
                let c = corr(natural, cand, 1);
                if c > best_c {
                    best_c = c;
                    best = cand;
                }
            }
            best
        };
        prev_pos = pos;

        for i in 0..n {
            let src = pos + i as i64;
            let w = window[i];
            wsum[out_start + i] += w;
            if src >= 0 && (src as usize) < len {
                for (o, c) in out.iter_mut().zip(channels) {
                    o[out_start + i] += w * c[src as usize];
                }
            }
        }
    }

    for o in out.iter_mut() {
        o.truncate(out_len);
        for (s, &w) in o.iter_mut().zip(&wsum) {
            *s = if w > 1e-3 { *s / w } else { 0.0 };
        }
    }
    out
}

/// Read `x` with step `ratio` (ratio > 1 raises pitch) using a windowed-sinc
/// interpolator whose cutoff drops below Nyquist when decimating.
pub fn resample(x: &[f32], ratio: f64, out_len: usize) -> Vec<f32> {
    const HALF: usize = 16;
    const PHASES: usize = 256;
    let cutoff = if ratio > 1.0 { 1.0 / ratio } else { 1.0 };
    let half = (HALF as f64 / cutoff).ceil() as usize;
    let taps = 2 * half;

    // Kernel table: row p holds normalized tap weights for fractional offset p/PHASES.
    let table: Vec<f32> = (0..=PHASES)
        .flat_map(|p| {
            let frac = p as f64 / PHASES as f64;
            let row: Vec<f64> = (0..taps)
                .map(|k| {
                    let d = frac + half as f64 - 1.0 - k as f64;
                    let u = d / half as f64;
                    if u.abs() >= 1.0 {
                        return 0.0;
                    }
                    let arg = PI * d * cutoff;
                    let sinc = if arg.abs() < 1e-9 {
                        1.0
                    } else {
                        arg.sin() / arg
                    };
                    sinc * (0.5 + 0.5 * (PI * u).cos())
                })
                .collect();
            let norm: f64 = row.iter().sum();
            row.into_iter().map(move |k| (k / norm) as f32)
        })
        .collect();

    // Zero-pad the input so every tap window is a plain slice.
    let mut padded = vec![0.0f32; x.len() + 2 * taps + 2];
    padded[half..half + x.len()].copy_from_slice(x);
    let max_center = x.len() + taps;

    (0..out_len)
        .map(|j| {
            let t = j as f64 * ratio;
            let center = (t.floor() as usize).min(max_center);
            let pf = (t - t.floor()) * PHASES as f64;
            let p = (pf as usize).min(PHASES - 1);
            let g = (pf - p as f64) as f32;
            // Taps cover input indices center-half+1 ..= center+half, i.e. padded[center+1 ..].
            let src = &padded[center + 1..center + 1 + taps];
            let (r0, r1) = (
                &table[p * taps..(p + 1) * taps],
                &table[(p + 1) * taps..(p + 2) * taps],
            );
            src.iter()
                .zip(r0.iter().zip(r1))
                .map(|(&v, (&a, &b))| v * (a + (b - a) * g))
                .sum()
        })
        .collect()
}

/// Pitch shift by `semitones` and time-stretch by `stretch` in one pass.
/// Output length = input length * stretch regardless of the pitch change.
pub fn process(
    channels: &[&[f32]],
    sample_rate: f32,
    semitones: f64,
    stretch: f64,
) -> Vec<Vec<f32>> {
    process_with_progress(
        channels,
        sample_rate,
        semitones,
        stretch,
        Algorithm::Wsola,
        Formant::Follow,
        &mut |_| {},
    )
}

/// Time-stretch method used for both stretching and (before resampling) pitch shifting.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Algorithm {
    Wsola,
    PhaseVocoder,
}

impl Algorithm {
    pub fn from_id(id: u32) -> Self {
        if id == 1 {
            Algorithm::PhaseVocoder
        } else {
            Algorithm::Wsola
        }
    }

    fn stretch(
        self,
        channels: &[&[f32]],
        alpha: f64,
        sr: f32,
        progress: &mut dyn FnMut(f64),
    ) -> Vec<Vec<f32>> {
        match self {
            Algorithm::Wsola => wsola_with_progress(channels, alpha, sr, progress),
            Algorithm::PhaseVocoder => pv::stretch(channels, alpha, sr, progress),
        }
    }
}

/// Formant handling for `process_with_progress`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Formant {
    /// Formants move with the pitch (plain resampling).
    Follow,
    /// Keep formants, then shift them by this many semitones (0 = preserve).
    Shift(f64),
}

/// `process` that reports overall progress in 0..=1 through `progress`.
pub fn process_with_progress(
    channels: &[&[f32]],
    sample_rate: f32,
    semitones: f64,
    stretch: f64,
    algorithm: Algorithm,
    formant: Formant,
    progress: &mut dyn FnMut(f64),
) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    let target_len = (len as f64 * stretch).round() as usize;
    let ratio = 2f64.powf(semitones / 12.0);
    let pitch = (ratio - 1.0).abs() > 1e-9;
    // Envelope warp applied before resampling (see `formant`).
    let warp = match formant {
        Formant::Follow => 1.0,
        Formant::Shift(st) => ratio / 2f64.powf(st / 12.0),
    };
    let correct = (warp - 1.0).abs() > 1e-9;

    // Rough cost split of the stages, used only for progress reporting.
    let stretch_share = if correct {
        0.5
    } else if pitch {
        0.6
    } else {
        1.0
    };
    let formant_share = if correct {
        if pitch {
            0.3
        } else {
            0.5
        }
    } else {
        0.0
    };
    let n = channels.len().max(1) as f64;

    let mut out = algorithm.stretch(channels, stretch * ratio, sample_rate, &mut |p| {
        progress(p * stretch_share)
    });
    if correct {
        for (i, c) in out.iter_mut().enumerate() {
            let base = stretch_share + formant_share * i as f64 / n;
            *c = formant::correct(c, warp, sample_rate, &mut |p| {
                progress(base + formant_share * p / n)
            });
        }
    }
    if pitch {
        let base = stretch_share + formant_share;
        for (i, c) in out.iter_mut().enumerate() {
            progress(base + (1.0 - base) * i as f64 / n);
            *c = resample(c, ratio, target_len);
        }
    }
    progress(1.0);
    out
}

// ---- C ABI for wasm -------------------------------------------------------

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    /// Provided by the host (worker) as `env.report_progress`.
    fn report_progress(p: f64);
}

fn host_progress(p: f64) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        report_progress(p)
    };
    #[cfg(not(target_arch = "wasm32"))]
    let _ = p;
}

thread_local! {
    static OUTPUT: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
}

/// Allocate `len` f32 values in wasm memory and return the pointer.
#[no_mangle]
pub extern "C" fn alloc_f32(len: usize) -> *mut f32 {
    let mut v = vec![0.0f32; len];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// Free memory returned by `alloc_f32`.
///
/// # Safety
/// `ptr`/`len` must come from a single `alloc_f32` call.
#[no_mangle]
pub unsafe extern "C" fn free_f32(ptr: *mut f32, len: usize) {
    drop(Vec::from_raw_parts(ptr, len, len));
}

/// Process planar audio (`channels` blocks of `frames` samples) and return the
/// output frame count. Fetch the planar result with `output_ptr`.
///
/// # Safety
/// `input` must point to `frames * channels` valid f32 values.
#[no_mangle]
pub unsafe extern "C" fn process_planar(
    input: *const f32,
    frames: usize,
    channels: usize,
    sample_rate: f32,
    semitones: f64,
    stretch: f64,
    algorithm: u32,
    preserve_formant: u32,
    formant_semitones: f64,
) -> usize {
    let all = std::slice::from_raw_parts(input, frames * channels);
    let chans: Vec<&[f32]> = all.chunks(frames.max(1)).take(channels).collect();
    let out = process_with_progress(
        &chans,
        sample_rate,
        semitones,
        stretch,
        Algorithm::from_id(algorithm),
        if preserve_formant != 0 {
            Formant::Shift(formant_semitones)
        } else {
            Formant::Follow
        },
        &mut host_progress,
    );
    let out_frames = out.first().map_or(0, |c| c.len());
    OUTPUT.with(|o| {
        let mut o = o.borrow_mut();
        o.clear();
        for c in &out {
            o.extend_from_slice(c);
        }
    });
    out_frames
}

#[no_mangle]
pub extern "C" fn output_ptr() -> *const f32 {
    OUTPUT.with(|o| o.borrow().as_ptr())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, sr: f32, secs: f32) -> Vec<f32> {
        (0..(sr * secs) as usize)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr).sin() * 0.5)
            .collect()
    }

    /// Estimate frequency from positive-going zero crossings in the middle.
    fn freq(x: &[f32], sr: f32) -> f32 {
        let m = &x[x.len() / 4..x.len() * 3 / 4];
        let crossings = m.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
        crossings as f32 / (m.len() as f32 / sr)
    }

    const ALGOS: [Algorithm; 2] = [Algorithm::Wsola, Algorithm::PhaseVocoder];

    fn run(x: &[&[f32]], sr: f32, semi: f64, alpha: f64, algo: Algorithm) -> Vec<Vec<f32>> {
        process_with_progress(x, sr, semi, alpha, algo, Formant::Follow, &mut |_| {})
    }

    #[test]
    fn stretch_keeps_pitch() {
        let sr = 44100.0;
        let x = sine(220.0, sr, 1.0);
        for algo in ALGOS {
            for alpha in [0.5, 2.0, 4.0] {
                let y = run(&[&x], sr, 0.0, alpha, algo);
                assert_eq!(y[0].len(), (x.len() as f64 * alpha).round() as usize);
                let f = freq(&y[0], sr);
                assert!((f - 220.0).abs() < 4.0, "{algo:?} alpha {alpha}: {f}Hz");
            }
        }
    }

    #[test]
    fn pitch_keeps_length() {
        let sr = 48000.0;
        let x = sine(220.0, sr, 1.0);
        for algo in ALGOS {
            for (semi, expect) in [(12.0, 440.0), (-12.0, 110.0), (5.0, 293.66)] {
                let y = run(&[&x], sr, semi, 1.0, algo);
                assert_eq!(y[0].len(), x.len());
                let f = freq(&y[0], sr);
                assert!(
                    (f - expect).abs() < expect * 0.02,
                    "{algo:?} semi {semi}: {f}Hz"
                );
            }
        }
    }

    /// Stretching must not make the end choppy: the envelope of a steady tone
    /// should stay flat right up to the last frames.
    #[test]
    fn stretch_tail_is_steady() {
        let sr = 48000.0;
        let x = sine(220.0, sr, 0.3);
        for (algo, alpha) in ALGOS
            .into_iter()
            .flat_map(|a| [2.0, 4.0, 8.0].map(|x| (a, x)))
        {
            let y = &run(&[&x], sr, 0.0, alpha, algo)[0];
            // Peak level in 10ms blocks over the last 30% (excluding the final block).
            let block = (sr * 0.01) as usize;
            let start = y.len() * 7 / 10;
            let peaks: Vec<f32> = y[start..y.len() - block]
                .chunks(block)
                .map(|b| b.iter().fold(0.0f32, |m, v| m.max(v.abs())))
                .collect();
            let min = peaks.iter().cloned().fold(f32::MAX, f32::min);
            assert!(
                min > 0.4,
                "{algo:?} alpha {alpha}: tail level dips to {min} ({peaks:?})"
            );
        }
    }

    /// 150Hz pulse train through a two-pole resonator at `formant` Hz.
    fn vowel(sr: f32, secs: f32, f0: f32, formant: f32) -> Vec<f32> {
        let period = (sr / f0) as usize;
        let r = (-std::f32::consts::PI * 120.0 / sr).exp();
        let a1 = 2.0 * r * (2.0 * std::f32::consts::PI * formant / sr).cos();
        let a2 = -r * r;
        let (mut y1, mut y2) = (0.0f32, 0.0f32);
        (0..(sr * secs) as usize)
            .map(|i| {
                let x = if i % period == 0 { 1.0 } else { 0.0 };
                let y = x + a1 * y1 + a2 * y2;
                y2 = y1;
                y1 = y;
                y * 0.05
            })
            .collect()
    }

    /// Magnitude-weighted spectral centroid below 4kHz of the middle 4096 samples.
    fn centroid(x: &[f32], sr: f32) -> f32 {
        let n = 4096;
        let mid = x.len() / 2 - n / 2;
        let fft = fft::Fft::new(n);
        let mut re: Vec<f32> = (0..n)
            .map(|i| x[mid + i] * (0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos()))
            .collect();
        let mut im = vec![0.0f32; n];
        fft.run(&mut re, &mut im, false);
        let max_bin = (4000.0 / sr * n as f32) as usize;
        let (mut num, mut den) = (0.0f32, 0.0f32);
        for b in 1..max_bin {
            let m = (re[b] * re[b] + im[b] * im[b]).sqrt();
            num += m * b as f32 * sr / n as f32;
            den += m;
        }
        num / den
    }

    #[test]
    fn formant_is_preserved() {
        let sr = 48000.0;
        let x = vowel(sr, 1.0, 150.0, 800.0);
        let base = centroid(&x, sr);
        for algo in ALGOS {
            let follow = process_with_progress(&[&x], sr, 12.0, 1.0, algo, Formant::Follow, &mut |_| {});
            let keep = process_with_progress(&[&x], sr, 12.0, 1.0, algo, Formant::Shift(0.0), &mut |_| {});
            let (cf, ck) = (centroid(&follow[0], sr), centroid(&keep[0], sr));
            println!("{algo:?}: original {base:.0}Hz, follow {cf:.0}Hz, preserve {ck:.0}Hz");
            assert!(cf > base * 1.5, "{algo:?}: follow should move formants up ({cf} vs {base})");
            assert!((ck - base).abs() < base * 0.25, "{algo:?}: preserve moved formants ({ck} vs {base})");
            // Pitch must still be shifted with the formant kept.
            assert_eq!(keep[0].len(), x.len());
        }
    }

    #[test]
    fn formant_shift_without_pitch() {
        let sr = 48000.0;
        let x = vowel(sr, 1.0, 150.0, 800.0);
        let base = centroid(&x, sr);
        let y = process_with_progress(&[&x], sr, 0.0, 1.0, Algorithm::Wsola, Formant::Shift(7.0), &mut |_| {});
        let c = centroid(&y[0], sr);
        println!("formant +7: {base:.0}Hz -> {c:.0}Hz");
        assert!(c > base * 1.2, "formant shift +7 should raise the centroid ({c} vs {base})");
        assert!(y[0].iter().all(|v| v.is_finite()));
    }

    /// `cargo test --release -- --ignored --nocapture` to time 3 min of stereo audio.
    #[test]
    #[ignore]
    fn bench_three_minutes() {
        let sr = 48000.0;
        let x = sine(220.0, sr, 180.0);
        for algo in ALGOS {
            for (semi, alpha) in [(0.0, 2.0), (5.0, 1.0), (5.0, 2.0)] {
                let t = std::time::Instant::now();
                run(&[&x, &x], sr, semi, alpha, algo);
                println!("{algo:?} semi {semi} x{alpha}: {:?}", t.elapsed());
            }
        }
    }

    #[test]
    fn combined_and_stereo() {
        let sr = 44100.0;
        let l = sine(220.0, sr, 0.5);
        let r = sine(330.0, sr, 0.5);
        let y = process(&[&l, &r], sr, 5.0, 2.0);
        assert_eq!(y.len(), 2);
        assert_eq!(y[0].len(), l.len() * 2);
        assert!(y.iter().flatten().all(|v| v.is_finite()));
    }
}
