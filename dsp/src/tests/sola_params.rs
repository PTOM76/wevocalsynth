//! SOLAv2・v3 の調整できる値（`sola2::Params`）を、組み合わせごとに測って比べる。
//! `cargo test --release sola_params -- --ignored --nocapture`

use super::consonant::{measure, noise, syllables};
use super::stretch::{periodicity, vibrato_vowel};
use crate::sola2::{self, Params, PARAMS};

/// 雑音を伸ばしたときの音程感: 2〜30ms のずれでの正規化自己相関の最大（0 に近いほど雑音のまま。ブロックの繰り返しで高くなる）
fn tonality(y: &[f32], sr: f32) -> f32 {
    let (s, n) = (y.len() / 4, y.len() / 2);
    let a = &y[s..s + n];
    let aa: f32 = a.iter().map(|v| v * v).sum();
    ((sr * 0.002) as usize..(sr * 0.03) as usize)
        .map(|lag| {
            let b = &y[s + lag..s + lag + n];
            let ab: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
            let bb: f32 = b.iter().map(|v| v * v).sum();
            ab / (aa * bb).sqrt().max(1e-9)
        })
        .fold(0.0f32, f32::max)
}

/// 1 つの組み合わせの（母音の周期のきれいさ ×4、破裂のかたまり ×3、立ち上がり ×3 ms、雑音の音程感 ×3）
fn score(p: &Params) -> (f32, f32, f32, f32) {
    let sr = 48000.0;
    let vowel = vibrato_vowel(sr, 1.0, 180.0);
    let per = periodicity(&sola2::stretch_with(&[&vowel], 4.0, sr, p, &mut |_| {})[0], sr, 180.0);
    let syl = syllables(sr, 8);
    let (peaks, rise, _) = measure(&sola2::stretch_with(&[&syl], 3.0, sr, p, &mut |_| {})[0], sr, 3.0, 8);
    let nz: Vec<f32> = noise(sr as usize, 3).iter().map(|v| v * 0.2).collect();
    let ton = tonality(&sola2::stretch_with(&[&nz], 3.0, sr, p, &mut |_| {})[0], sr);
    (per, peaks, rise, ton)
}

#[test]
#[ignore]
fn sola_params() {
    let (per, peaks, rise, ton) = score(&PARAMS);
    println!("current {PARAMS:?}: periodicity {per:.4}, peaks {peaks:.2}, rise {rise:.1}ms, tonality {ton:.3}");
    for unvoiced in [0.008, 0.012, 0.016, 0.02] {
        for fade in [0.003, 0.005, 0.008] {
            for tolerance in [0.003, 0.006, 0.01] {
                for transient in [0.01, 0.015, 0.02] {
                    let p = Params { unvoiced, fade, tolerance, transient, ..PARAMS };
                    let (per, peaks, rise, ton) = score(&p);
                    println!("u {unvoiced} f {fade} t {tolerance} tr {transient}: periodicity {per:.4}, peaks {peaks:.2}, rise {rise:.1}ms, tonality {ton:.3}");
                }
            }
        }
    }
}