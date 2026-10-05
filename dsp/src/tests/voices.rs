//! 和音を 2 つの声に分ける試作の確認（memo/harmony-split.md）。結果は `cargo test voices -- --nocapture` で表示する

use crate::voices::{analyze, split, SplitBy};

const SR: f32 = 48000.0;
const SECS: f32 = 2.0;

/// 合成の声。`f0` は時刻（秒）から F0 を返す。フォルマントの山 `formants`（Hz）を付け、5.5Hz のビブラートをかける
fn voice(f0: impl Fn(f32) -> f32, formants: &[f32], gain: f32) -> Vec<f32> {
    let n = (SR * SECS) as usize;
    let mut phase = vec![0.0f32; 60];
    (0..n)
        .map(|i| {
            let t = i as f32 / SR;
            let f = f0(t) * 2f32.powf(0.3 / 12.0 * (2.0 * std::f32::consts::PI * 5.5 * t).sin());
            let mut s = 0.0;
            for (h, p) in phase.iter_mut().enumerate() {
                let hz = f * (h + 1) as f32;
                if hz > 8000.0 {
                    break;
                }
                *p += 2.0 * std::f32::consts::PI * hz / SR;
                let env: f32 = formants.iter().map(|c| (-((hz - c) / 300.0).powi(2)).exp()).sum::<f32>() + 0.2;
                s += p.sin() * env / (h + 1) as f32;
            }
            s * gain * 0.1
        })
        .collect()
}

/// 信号と誤差の比（dB）。両端の 0.25 秒は除く
fn sdr(truth: &[f32], est: &[f32]) -> f32 {
    let r = (SR * 0.25) as usize..truth.len() - (SR * 0.25) as usize;
    let s: f32 = truth[r.clone()].iter().map(|x| x * x).sum();
    let e: f32 = r.map(|i| (truth[i] - est[i]).powi(2)).sum();
    10.0 * (s / e.max(1e-12)).log10()
}

/// 2 つの声を足して分け、(A の SDR, B の SDR) を返す。`a` が A に入るべき声
fn run(a: &[f32], b: &[f32], by: SplitBy) -> (f32, f32) {
    let mix: Vec<f32> = a.iter().zip(b).map(|(x, y)| x + y).collect();
    let (oa, ob) = split(&[&mix], SR, by);
    // A + B は元の音と一致する
    let err = (0..mix.len()).map(|i| (oa[0][i] + ob[0][i] - mix[i]).abs()).fold(0.0f32, f32::max);
    assert!(err < 1e-3, "A + B と元の音の差 {err}");
    (sdr(a, &oa[0]), sdr(b, &ob[0]))
}

const LOW: [f32; 3] = [500.0, 1100.0, 2500.0];
const HIGH: [f32; 3] = [800.0, 1500.0, 2900.0];

/// 音程ごとに、高さで分ける
#[test]
fn voices_by_pitch() {
    let base = 220.0;
    for (name, semi) in [("3 度", 4.0), ("5 度", 7.0), ("8 度", 12.0)] {
        let low = voice(|_| base, &LOW, 1.0);
        let high = voice(|_| base * 2f32.powf(semi / 12.0), &HIGH, 1.0);
        let (sa, sb) = run(&high, &low, SplitBy::Pitch);
        eprintln!("高さ {name}: 高い方 {sa:.1} dB, 低い方 {sb:.1} dB");
        assert!(sa > 0.0 && sb > 0.0, "{name}: {sa} {sb}");
    }
}

/// 片方が -6dB のとき、音量で分ける（小さい方を上にして、高さでは分けられないことも見る）
#[test]
fn voices_by_volume() {
    let main = voice(|_| 220.0, &LOW, 1.0);
    let harmony = voice(|_| 220.0 * 2f32.powf(4.0 / 12.0), &HIGH, 0.5);
    let (sa, sb) = run(&main, &harmony, SplitBy::Volume);
    eprintln!("音量 3 度 -6dB: 大きい方 {sa:.1} dB, 小さい方 {sb:.1} dB");
    assert!(sa > 0.0 && sb > 0.0, "{sa} {sb}");
}

/// 声が交差するとき（片方が上がって入れ替わる）。高さでは出力が入れ替わり、音量では声のまま保たれるかを見る
#[test]
fn voices_crossing() {
    let rising = voice(|t| 200.0 * 2f32.powf(7.0 / 12.0 * t / SECS * 2.0), &LOW, 1.0);
    let steady = voice(|_| 260.0, &HIGH, 0.5);
    let (sa, sb) = run(&rising, &steady, SplitBy::Volume);
    eprintln!("交差（音量）: 大きい方 {sa:.1} dB, 小さい方 {sb:.1} dB");
    let (pa, pb) = run(&rising, &steady, SplitBy::Pitch);
    eprintln!("交差（高さ、声のままにはならない想定）: {pa:.1} dB, {pb:.1} dB");
}

/// F0 の推定（3 度の和音で、2 つの F0 が 30 セント以内で見つかるフレームの割合）
#[test]
fn voices_f0() {
    let (fl, fh) = (220.0, 220.0 * 2f32.powf(4.0 / 12.0));
    let mix: Vec<f32> = voice(|_| fl, &LOW, 1.0).iter().zip(voice(|_| fh, &HIGH, 1.0)).map(|(a, b)| a + b).collect();
    let frames = analyze(&mix, SR);
    // ビブラートの分（±30 セント）を許す
    let near = |f: f32, t: f32| (1200.0 * (f / t).log2()).abs() < 60.0;
    let ok = frames.iter().filter(|v| v.len() == 2 && v.iter().any(|x| near(x.f0, fl)) && v.iter().any(|x| near(x.f0, fh))).count();
    let rate = ok as f32 / frames.len() as f32;
    eprintln!("F0 3 度: 2 つとも見つかったフレーム {:.0}%", rate * 100.0);
    assert!(rate > 0.8, "{rate}");
}
