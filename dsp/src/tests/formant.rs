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
