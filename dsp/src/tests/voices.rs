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
    let (oa, ob) = split(&[&mix], SR, by, &mut |_| {});
    // A + B は元の音と一致する
    let err = (0..mix.len()).map(|i| (oa[0][i] + ob[0][i] - mix[i]).abs()).fold(0.0f32, f32::max);
    assert!(err < 1e-3, "A + B と元の音の差 {err}");
    (sdr(a, &oa[0]), sdr(b, &ob[0]))
}

const LOW: [f32; 3] = [500.0, 1100.0, 2500.0];
const HIGH: [f32; 3] = [800.0, 1500.0, 2900.0];

/// 音程ごとに、高さで分ける（8 度は分けない仕様）
#[test]
fn voices_by_pitch() {
    let base = 220.0;
    for (name, semi) in [("3 度", 4.0), ("5 度", 7.0), ("8 度", 12.0)] {
        let low = voice(|_| base, &LOW, 1.0);
        let high = voice(|_| base * 2f32.powf(semi / 12.0), &HIGH, 1.0);
        let (sa, sb) = run(&high, &low, SplitBy::Pitch);
        eprintln!("高さ {name}: 高い方 {sa:.1} dB, 低い方 {sb:.1} dB");
        // 1 オクターブ離れた和音は、倍音を選んだ誤りと見分けられないので分けない（仕様）
        if semi < 12.0 {
            assert!(sa > 0.0 && sb > 0.0, "{name}: {sa} {sb}");
        }
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
    let frames = analyze(&mix, SR, &mut |_| {});
    // ビブラートの分（±30 セント）を許す
    let near = |f: f32, t: f32| (1200.0 * (f / t).log2()).abs() < 60.0;
    let ok = frames.iter().filter(|v| v.len() == 2 && v.iter().any(|x| near(x.f0, fl)) && v.iter().any(|x| near(x.f0, fh))).count();
    let rate = ok as f32 / frames.len() as f32;
    eprintln!("F0 3 度: 2 つとも見つかったフレーム {:.0}%", rate * 100.0);
    assert!(rate > 0.8, "{rate}");
}

/// 歌声に近い合成の声。F0 は `notes`（秒、半音）の階段を 40ms でつなぎ、深さ `depth` セント・速さ `rate` Hz のビブラートと息の雑音を付ける
fn singer(base: f32, notes: &[(f32, f32)], formants: &[f32], gain: f32, depth: f32, rate: f32, seed: u32) -> Vec<f32> {
    let n = (SR * SECS) as usize;
    let mut phase = vec![0.0f32; 60];
    let mut rng = seed.wrapping_mul(2654435761).max(1);
    let semi = |t: f32| {
        let mut s = notes[0].1;
        for w in notes.windows(2) {
            let k = ((t - w[1].0) / 0.04).clamp(0.0, 1.0);
            s += (w[1].1 - w[0].1) * k;
        }
        s
    };
    (0..n)
        .map(|i| {
            let t = i as f32 / SR;
            let f = base * 2f32.powf(semi(t) / 12.0 + depth / 1200.0 * (2.0 * std::f32::consts::PI * rate * t).sin());
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
            rng ^= rng << 13;
            rng ^= rng >> 17;
            rng ^= rng << 5;
            let noise = (rng as f32 / u32::MAX as f32 - 0.5) * 0.02;
            (s * 0.1 + noise) * gain
        })
        .collect()
}

/// 歌声に近い条件（深いビブラート、声ごとに違う揺れ、音の移り変わり、ハモリが小さい）で、主旋律とハモリを分ける
#[test]
fn voices_singing() {
    let melody = [(0.0, 0.0), (0.5, 2.0), (1.0, 4.0), (1.5, 2.0)];
    let harmony = [(0.0, 4.0), (0.5, 5.0), (1.0, 7.0), (1.5, 5.0)];
    for (name, gain) in [("-4dB", 0.63), ("-8dB", 0.4), ("-12dB", 0.25)] {
        let main = singer(220.0, &melody, &LOW, 1.0, 50.0, 5.3, 1);
        let harm = singer(220.0, &harmony, &HIGH, gain, 40.0, 6.1, 2);
        let (va, vb) = run(&main, &harm, SplitBy::Volume);
        let (pa, pb) = run(&harm, &main, SplitBy::Pitch);
        eprintln!("歌声 ハモリ {name}: 音量 主 {va:.1} / ハモリ {vb:.1} dB, 高さ ハモリ {pa:.1} / 主 {pb:.1} dB");
    }
}

/// 歌声に近い条件で、主旋律とハモリの F0 が両方見つかるフレームの割合
#[test]
fn voices_singing_f0() {
    let melody = [(0.0, 0.0), (0.5, 2.0), (1.0, 4.0), (1.5, 2.0)];
    let harmony = [(0.0, 4.0), (0.5, 5.0), (1.0, 7.0), (1.5, 5.0)];
    for gain in [0.63, 0.4, 0.25] {
        let mix: Vec<f32> = singer(220.0, &melody, &LOW, 1.0, 50.0, 5.3, 1).iter().zip(singer(220.0, &harmony, &HIGH, gain, 40.0, 6.1, 2)).map(|(a, b)| a + b).collect();
        let frames = analyze(&mix, SR, &mut |_| {});
        let two = frames.iter().filter(|v| v.len() == 2).count() as f32 / frames.len() as f32;
        let semi = |t: f32, n: &[(f32, f32)]| n.iter().rev().find(|x| x.0 <= t).unwrap().1;
        let mut ok = 0;
        for (f, v) in frames.iter().enumerate() {
            let t = (f * 512 + 2048) as f32 / SR;
            let th = 220.0 * 2f32.powf(semi(t, &harmony) / 12.0);
            let tm = 220.0 * 2f32.powf(semi(t, &melody) / 12.0);
            let near = |x: f32, y: f32| (1200.0 * (x / y).log2()).abs() < 80.0;
            if v.len() == 2 && v.iter().any(|x| near(x.f0, tm)) && v.iter().any(|x| near(x.f0, th)) {
                ok += 1;
            }
        }
        eprintln!("歌声 F0 {gain}: 2 声のフレーム {:.0}%, 2 つとも正しい {:.0}%", two * 100.0, ok as f32 * 100.0 / frames.len() as f32);
    }
}

/// 実際の曲で分ける（`VOICES_IN` の f32 のステレオ平面の生データ → `VOICES_OUT`_a.f32, _b.f32）。`cargo test --release voices_file -- --ignored --nocapture`
#[test]
#[ignore]
fn voices_file() {
    let (Ok(inp), Ok(out)) = (std::env::var("VOICES_IN"), std::env::var("VOICES_OUT")) else { return };
    let raw: Vec<f32> = std::fs::read(inp).unwrap().chunks_exact(4).map(|b| f32::from_le_bytes(b.try_into().unwrap())).collect();
    let n = raw.len() / 2;
    let (l, r) = raw.split_at(n);
    let mono: Vec<f32> = l.iter().zip(r).map(|(a, b)| (a + b) / 2.0).collect();
    let frames = analyze(&mono, SR, &mut |_| {});
    let two = frames.iter().filter(|v| v.len() == 2).count();
    eprintln!("2 声 {two} / {}", frames.len());
    // 2 つの声の音程（半音）ごとのフレーム数
    let mut hist = [0usize; 40];
    for v in &frames {
        if v.len() == 2 {
            hist[((12.0 * (v[0].f0 / v[1].f0).log2().abs()).round() as usize).min(39)] += 1;
        }
    }
    eprintln!("音程（半音）ごとのフレーム数 {hist:?}");
    // 前後 1 フレームに近い声がない声（一瞬だけの外れ）
    let near = |v: &[crate::voices::Voice], f0: f32| v.iter().any(|x| (1200.0 * (x.f0 / f0).log2()).abs() < 100.0);
    let blips: Vec<String> = (1..frames.len() - 1)
        .filter(|&f| frames[f].iter().any(|x| !near(&frames[f - 1], x.f0) && !near(&frames[f + 1], x.f0)))
        .map(|f| format!("{:.2}", (f * 512 + 2048) as f32 / SR))
        .collect();
    eprintln!("一瞬だけの外れ {} フレーム: {}", blips.len(), blips.join(" "));
    let ones: Vec<String> = (0..frames.len())
        .filter(|&f| f as f32 * 512.0 / SR > 12.0 && frames[f].len() < 2)
        .map(|f| format!("{:.2}({})", (f * 512 + 2048) as f32 / SR, frames[f].len()))
        .collect();
    eprintln!("1 声以下のフレーム {}: {}", ones.len(), ones.join(" "));
    if let Ok(at) = std::env::var("VOICES_AT") {
        for t in at.split(',').map(|t| t.parse::<f32>().unwrap()) {
            let c = ((t * SR - 2048.0) / 512.0) as usize;
            for f in c - 12..=c + 6 {
                let d: Vec<String> = frames[f].iter().map(|x| format!("{:.0}Hz {:.0}dB", x.f0, 10.0 * x.amps.iter().map(|a| a * a).sum::<f32>().max(1e-12).log10())).collect();
                eprintln!("AT {:.2} {}", (f * 512 + 2048) as f32 / SR, d.join(" | "));
            }
        }
    }
    let (a, b) = split(&[l, r], SR, SplitBy::Pitch, &mut |_| {});
    for (name, o) in [("a", a), ("b", b)] {
        let bytes: Vec<u8> = o.concat().iter().flat_map(|x| x.to_le_bytes()).collect();
        std::fs::write(format!("{out}_{name}.f32"), bytes).unwrap();
    }
}

/// 残響（1.2 秒で -60dB に減る雑音）を足す
fn reverb(x: &[f32], seed: u32) -> Vec<f32> {
    let n = (SR * 1.2) as usize;
    let mut rng = seed.wrapping_mul(2654435761).max(1);
    let ir: Vec<f32> = (0..n / 8)
        .map(|i| {
            rng ^= rng << 13;
            rng ^= rng >> 17;
            rng ^= rng << 5;
            (rng as f32 / u32::MAX as f32 - 0.5) * (-6.9 * (i * 8) as f32 / n as f32).exp() * 0.05
        })
        .collect();
    let mut y = x.to_vec();
    for (j, g) in ir.iter().enumerate().skip(100) {
        for i in 0..x.len().saturating_sub(j * 8) {
            y[i + j * 8] += x[i] * g;
        }
    }
    y
}

/// 残響のある歌声で分ける
#[test]
fn voices_singing_reverb() {
    let melody = [(0.0, 0.0), (0.5, 2.0), (1.0, 4.0), (1.5, 2.0)];
    let harmony = [(0.0, 4.0), (0.5, 5.0), (1.0, 7.0), (1.5, 5.0)];
    let main = reverb(&singer(220.0, &melody, &LOW, 1.0, 50.0, 5.3, 1), 3);
    let harm = reverb(&singer(220.0, &harmony, &HIGH, 0.5, 40.0, 6.1, 2), 4);
    let (pa, pb) = run(&harm, &main, SplitBy::Pitch);
    eprintln!("歌声 残響 -6dB: ハモリ {pa:.1} / 主 {pb:.1} dB");
}


/// 分けたあとの低い方（`VOICES_OUT`_b.f32）に残った、高い方の声の倍音の大きさ（漏れ）を、フレームごとに測る。
/// 高い方の出力（_a）で推定した F0 の倍音のうち、低い方の F0 の倍音から離れた位置の大きさを、低い方の声の倍音の大きさと比べる
#[test]
#[ignore]
fn voices_leak() {
    use wevocal_lib::stft::Stft;
    let Ok(out) = std::env::var("VOICES_OUT") else { return };
    let read = |p: String| -> Vec<f32> {
        let raw: Vec<f32> = std::fs::read(p).unwrap().chunks_exact(4).map(|b| f32::from_le_bytes(b.try_into().unwrap())).collect();
        let n = raw.len() / 2;
        (0..n).map(|i| (raw[i] + raw[n + i]) / 2.0).collect()
    };
    let (hi, lo) = (read(format!("{out}_a.f32")), read(format!("{out}_b.f32")));
    let (fh, fl) = (analyze(&hi, SR, &mut |_| {}), analyze(&lo, SR, &mut |_| {}));
    let mut st = Stft::new(4096, 512);
    let b = st.bins();
    let bin_hz = SR / 4096.0;
    let (mut re, mut im) = (vec![0.0; b], vec![0.0; b]);
    let mut leaks = Vec::new();
    for f in 0..fh.len().min(fl.len()) {
        let (Some(h), Some(l)) = (fh[f].first(), fl[f].first()) else { continue };
        st.forward(&lo, f, &mut re, &mut im);
        let mag: Vec<f32> = re.iter().zip(&im).map(|(r, i)| (r * r + i * i).sqrt()).collect();
        let at = |hz: f32| {
            let k = (hz / bin_hz).round() as usize;
            if k >= 1 && k + 1 < b { mag[k - 1].max(mag[k]).max(mag[k + 1]).powi(2) } else { 0.0 }
        };
        let near_l = |hz: f32| ((hz / l.f0).round() * l.f0 - hz).abs() < 2.0 * bin_hz;
        let leak: f32 = (1..=(4000.0 / h.f0) as usize).map(|k| k as f32 * h.f0).filter(|&hz| !near_l(hz)).map(at).sum();
        let own: f32 = (1..=(4000.0 / l.f0) as usize).map(|k| at(k as f32 * l.f0)).sum();
        if own > 1e-6 && f as f32 * 512.0 / SR > 12.0 {
            leaks.push(((f * 512 + 2048) as f32 / SR, 10.0 * (leak / own).log10(), h.f0, l.f0));
        }
    }
    let mut sorted: Vec<f32> = leaks.iter().map(|x| x.1).collect();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let mean = sorted[sorted.len() / 2];
    eprintln!("漏れの中央値 {mean:.1} dB（{} フレーム）", leaks.len());
    leaks.sort_by(|a, b| b.1.total_cmp(&a.1));
    for (t, d, h, l) in leaks.iter().take(25) {
        eprintln!("LEAK {t:.2} {d:.1} dB 高い方 {h:.0}Hz 低い方 {l:.0}Hz");
    }
}
