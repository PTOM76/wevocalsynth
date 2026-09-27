//! F0 推定・スペクトログラムのテスト。

use super::*;
use crate::{f0, spec};

#[test]
fn f0_detects_pitch() {
    for sr in [44100.0, 48000.0] {
        for (x, expect) in [
            (sine(220.0, sr, 0.5), 220.0),
            (vowel(sr, 0.5, 150.0, 800.0), 150.0),
        ] {
            let f = f0::estimate(&x, sr, &mut |_| {});
            assert_eq!(f.len(), (x.len() as f32 / sr / f0::HOP_SEC) as usize + 1);
            // 端を除いた中央部分がすべて有声で、期待値の ±2% 以内であること。
            let mid = &f[5..f.len() - 5];
            for &v in mid {
                assert!(
                    (v - expect).abs() < expect * 0.02,
                    "sr {sr}: expected {expect}Hz, got {v}Hz"
                );
            }
        }
    }
}

/// 1kHz の正弦波で、1kHz 付近の段が最も明るく、無音部分は 0 になること。
#[test]
fn spectrogram_peak_row() {
    let sr = 48000.0;
    let mut x = sine(1000.0, sr, 0.5);
    x.extend(vec![0.0; 24000]);
    let s = spec::compute(&x, sr, &mut |_| {});
    let rows = spec::ROWS;
    let k = (0.25 * sr) as usize / spec::HOP;
    let frame = &s[k * rows..(k + 1) * rows];
    let peak = (0..rows).max_by_key(|&r| frame[r]).unwrap();
    let f = spec::MIN_HZ * (sr / 2.0 / spec::MIN_HZ).powf(peak as f32 / (rows - 1) as f32);
    assert!((f / 1000.0 - 1.0).abs() < 0.06, "peak row at {f}Hz");
    let quiet = (0.9 * sr) as usize / spec::HOP;
    assert!(s[quiet * rows..(quiet + 1) * rows].iter().all(|&v| v == 0));
}

#[test]
fn f0_silence_is_unvoiced() {
    let f = f0::estimate(&vec![0.0; 48000], 48000.0, &mut |_| {});
    assert!(f.iter().all(|&v| v == 0.0));
}
