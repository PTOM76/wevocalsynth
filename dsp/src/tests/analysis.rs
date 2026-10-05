//! F0 推定・スペクトログラムのテスト。

use super::*;
use crate::f0;

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

#[test]
fn f0_silence_is_unvoiced() {
    let f = f0::estimate(&vec![0.0; 48000], 48000.0, &mut |_| {});
    assert!(f.iter().all(|&v| v == 0.0));
}
