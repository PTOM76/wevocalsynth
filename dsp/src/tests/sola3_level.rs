//! SOLAv3 を分けずに長い音に掛けると、後ろほど音量が上がるかを測る（memo/webgpu.md の 9.）。
//! `cargo test --release sola3_level -- --ignored --nocapture`

use crate::{process_with_progress, sola2, Algorithm, Formant};

/// ビブラートのある一定の声（位相は f64 で積む。長い音で f32 だと周波数がずれる）
fn long_vowel(sr: f32, secs: f32, f0: f64) -> Vec<f32> {
    let mut phase = 0.0f64;
    (0..(sr * secs) as usize)
        .map(|i| {
            let t = i as f64 / sr as f64;
            let f = f0 * (1.0 + 0.03 * (2.0 * std::f64::consts::PI * 5.0 * t).sin());
            phase = (phase + 2.0 * std::f64::consts::PI * f / sr as f64) % (2.0 * std::f64::consts::PI * 6.0);
            ((1..=6).map(|h| (phase * h as f64).sin() / h as f64).sum::<f64>() * 0.3) as f32
        })
        .collect()
}

fn rms_per(y: &[f32], sr: f32, secs: f32) -> Vec<f32> {
    y.chunks((sr * secs) as usize).map(|c| (c.iter().map(|v| v * v).sum::<f32>() / c.len() as f32).sqrt()).collect()
}

#[test]
#[ignore]
fn sola3_level() {
    let sr = 48000.0;
    let x = long_vowel(sr, 45.0, 180.0);
    println!("input  {:.3?}", rms_per(&x, sr, 5.0));
    for alpha in [1.0, 2f64.powf(5.0 / 12.0)] {
        let v2 = sola2::stretch(&[&x], alpha, sr, &mut |_| {});
        let v3 = sola2::stretch_clean(&[&x], alpha, sr, &mut |_| {});
        println!("alpha {alpha:.3} v2 {:.3?}", rms_per(&v2[0], sr, 5.0 * alpha as f32));
        println!("alpha {alpha:.3} v3 {:.3?}", rms_per(&v3[0], sr, 5.0 * alpha as f32));
    }
    for (name, formant) in [("follow", Formant::Follow), ("keep", Formant::Shift(0.0))] {
        for algo in [Algorithm::Sola, Algorithm::Sola2, Algorithm::Sola3] {
            let y = process_with_progress(&[&x], sr, 5.0, 1.0, algo, formant, &mut |_| {});
            println!("+5 {name} {algo:?} {:.3?}", rms_per(&y[0], sr, 5.0));
        }
    }
}

/// SOLAv2 の出力に NaN が出ないか（末尾で隣の周期が入力に収まらないとき、重みの合計が 0 になっていた）
#[test]
fn sola2_no_nan_at_end() {
    let sr = 48000.0;
    let x = long_vowel(sr, 3.0, 180.0);
    for alpha in [0.8, 1.335, 2.0] {
        let y = sola2::stretch(&[&x], alpha, sr, &mut |_| {});
        let bad = y[0].iter().position(|v| !v.is_finite());
        assert!(bad.is_none(), "alpha {alpha}: NaN at {bad:?} / {}", y[0].len());
    }
}
