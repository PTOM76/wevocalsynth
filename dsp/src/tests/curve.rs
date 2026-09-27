//! ピッチカーブ編集のテスト。

use super::*;
use crate::{curve, Formant};

/// 前半そのまま・後半 +7 半音のカーブで、前半と後半のピッチがそれぞれ正しく、長さが変わらないこと。
#[test]
fn curve_changes_pitch_over_time() {
    let sr = 48000.0;
    let x = sine(220.0, sr, 1.0);
    let hop = sr as f64 * 0.01;
    let up = 2f32.powf(7.0 / 12.0);
    let ratios: Vec<f32> = (0..=100).map(|k| if k < 50 { 1.0 } else { up }).collect();
    for algo in ALGOS {
        for formant in [Formant::Follow, Formant::Shift(0.0)] {
            let y = &curve::process(&[&x], sr, &ratios, hop, algo, formant, &mut |_| {})[0];
            assert_eq!(y.len(), x.len());
            let q = y.len() / 4;
            let first = freq(&y[q / 2..q * 2 - q / 2], sr);
            let second = freq(&y[q * 2 + q / 2..y.len() - q / 2], sr);
            assert!(
                (first - 220.0).abs() < 220.0 * 0.03,
                "{algo:?} {formant:?}: first half {first}Hz"
            );
            let expect = 220.0 * up;
            assert!(
                (second - expect).abs() < expect * 0.03,
                "{algo:?} {formant:?}: second half {second}Hz"
            );
        }
    }
}
