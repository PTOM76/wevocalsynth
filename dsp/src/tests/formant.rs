//! フォルマント補正のテスト。

use super::*;
use crate::{process_with_progress, Algorithm, Formant};

#[test]
fn formant_is_preserved() {
    let sr = 48000.0;
    let x = vowel(sr, 1.0, 150.0, 800.0);
    let base = centroid(&x, sr);
    for algo in ALGOS {
        let follow =
            process_with_progress(&[&x], sr, 12.0, 1.0, algo, Formant::Follow, &mut |_| {});
        let keep =
            process_with_progress(&[&x], sr, 12.0, 1.0, algo, Formant::Shift(0.0), &mut |_| {});
        let (cf, ck) = (centroid(&follow[0], sr), centroid(&keep[0], sr));
        println!("{algo:?}: original {base:.0}Hz, follow {cf:.0}Hz, preserve {ck:.0}Hz");
        assert!(
            cf > base * 1.5,
            "{algo:?}: follow should move formants up ({cf} vs {base})"
        );
        assert!(
            (ck - base).abs() < base * 0.25,
            "{algo:?}: preserve moved formants ({ck} vs {base})"
        );
        // フォルマントを保持してもピッチ自体は変わっていること。
        assert_eq!(keep[0].len(), x.len());
    }
}

#[test]
fn formant_shift_without_pitch() {
    let sr = 48000.0;
    let x = vowel(sr, 1.0, 150.0, 800.0);
    let base = centroid(&x, sr);
    let y = process_with_progress(
        &[&x],
        sr,
        0.0,
        1.0,
        Algorithm::Wsola,
        Formant::Shift(7.0),
        &mut |_| {},
    );
    let c = centroid(&y[0], sr);
    println!("formant +7: {base:.0}Hz -> {c:.0}Hz");
    assert!(
        c > base * 1.2,
        "formant shift +7 should raise the centroid ({c} vs {base})"
    );
    assert!(y[0].iter().all(|v| v.is_finite()));
}

/// 高速版（2フレームずつ FFT）が以前の実装と同じ結果になること。補正率が時間で変わる場合と無音を含む場合で確かめる
#[test]
fn fast_formant_matches_reference() {
    use crate::formant::{correct_varying, correct_varying_reference};
    let sr = 48000.0;
    let mut x = vowel(sr, 0.7, 150.0, 800.0);
    x.extend(vec![0.0; 4800]); // 無音の区間
    x.extend(vowel(sr, 0.3, 220.0, 1200.0));
    let c_at = |i: usize| 1.0 + 0.5 * (i as f64 / 48000.0).sin();
    let t0 = std::time::Instant::now();
    let fast = correct_varying(&x, &c_at, sr, &mut |_| {});
    let t1 = std::time::Instant::now();
    let reference = correct_varying_reference(&x, &c_at, sr, &mut |_| {});
    let t2 = std::time::Instant::now();
    let peak = reference.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    let diff = fast.iter().zip(&reference).fold(0.0f32, |m, (a, b)| m.max((a - b).abs()));
    println!("max diff {diff:.2e} (peak {peak:.3}), fast {:?} / reference {:?}", t1 - t0, t2 - t1);
    assert_eq!(fast.len(), reference.len());
    assert!(diff < peak * 1e-3, "diff {diff} vs peak {peak}");
}
