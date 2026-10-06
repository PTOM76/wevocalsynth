//! 声の素材から一音を作る（試験的。memo/kana-voice.md）。今は母音だけ。
//!
//! 素材の母音から、F0 とその揺れ、響き（LPC の包絡）、かすれ（周期的でない成分の割合）を測り（`analyze_vowel`）、
//! 指定の高さと長さで作り直す（`synth_vowel`）。声帯の音は F0 の倍音の和と雑音で作り、響きの全極フィルターを掛ける。
//! 素材の波形を伸ばすのではなく作り直すので、高さを変えても響き（母音らしさ）は変わらない。

use wevocal_lib::f0;
use wevocal_lib::lpc;
use wevocal_lib::window::hann;

/// プリエンファシスの係数（分析の前に高域を持ち上げ、合成のあとで戻す）
const PRE: f32 = 0.97;
/// 分析のフレーム長（秒）
const FRAME_SEC: f32 = 0.03;
/// かすれの雑音の割合の範囲（測った値をこの範囲に収める）
const NOISE_MIN: f32 = 0.02;
const NOISE_MAX: f32 = 0.5;
/// LPC を安定させるラグ窓の幅（Hz）と、雑音の床（自己相関の 0 番目に足す割合）
const LAG_WINDOW_HZ: f64 = 50.0;
const NOISE_FLOOR: f64 = 1e-4;
/// 作った音の両端のフェード（秒）
const FADE_SEC: f32 = 0.01;

/// 素材の母音から測ったもの
#[derive(Clone, Debug)]
pub struct VowelModel {
    /// 分析したサンプルレート（合成もこのサンプルレートで行う）
    pub sample_rate: f32,
    /// F0 の中央値（Hz）
    pub f0: f32,
    /// F0 の揺れ（中央値からのずれ、セント。f0::HOP_SEC ごと）。作るときに繰り返し使う
    pub wobble: Vec<f32>,
    /// 響き（LPC 係数。プリエンファシスした信号のもの）
    pub lpc: Vec<f32>,
    /// かすれ（雑音の割合、0〜1）
    pub noise: f32,
    /// 素材の母音の大きさ（RMS）
    pub rms: f32,
}

/// LPC の次数（サンプルレートの kHz ＋ 4。高いサンプルレートでは上限を設ける）
fn order_for(sample_rate: f32) -> usize {
    ((sample_rate / 1000.0) as usize + 4).min(48)
}

/// 素材の母音（モノラル）を分析する。声のあるフレームがなければ None
pub fn analyze_vowel(x: &[f32], sample_rate: f32) -> Option<VowelModel> {
    let f0s = f0::estimate(x, sample_rate, &mut |_| {});
    let voiced: Vec<(usize, f32)> = f0s.iter().copied().enumerate().filter(|&(_, hz)| hz > 0.0).collect();
    if voiced.is_empty() {
        return None;
    }
    let mut sorted: Vec<f32> = voiced.iter().map(|&(_, hz)| hz).collect();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let median = sorted[sorted.len() / 2];
    let wobble = voiced.iter().map(|&(_, hz)| 1200.0 * (hz / median).log2()).collect();

    // 声のあるフレームの自己相関を平均し、1 つの LPC にする（フレームごとの揺れをならす）
    let order = order_for(sample_rate);
    let n = (FRAME_SEC * sample_rate) as usize;
    let window = hann(n);
    let hop = f0::HOP_SEC * sample_rate;
    let mut acc = vec![0.0f64; order + 1];
    let mut periodic = 0.0f64;
    let mut frames = 0usize;
    let mut frame = vec![0.0f32; n];
    for &(k, hz) in &voiced {
        let start = (k as f32 * hop) as i64 - (n / 2) as i64;
        if start < 1 || start as usize + n > x.len() {
            continue;
        }
        let s = start as usize;
        for i in 0..n {
            frame[i] = (x[s + i] - PRE * x[s + i - 1]) * window[i];
        }
        let r0: f64 = frame.iter().map(|&v| v as f64 * v as f64).sum();
        if r0 < 1e-8 {
            continue;
        }
        for (lag, v) in acc.iter_mut().enumerate() {
            *v += frame[lag..].iter().zip(&frame).map(|(&a, &b)| a as f64 * b as f64).sum::<f64>() / r0;
        }
        // 周期の位置の自己相関（元の信号）で、周期的な成分の割合を見る
        let period = (sample_rate / hz).round() as usize;
        if period < n {
            let seg = &x[s..s + n];
            let e: f64 = seg.iter().map(|&v| v as f64 * v as f64).sum();
            let c: f64 = seg[period..].iter().zip(seg).map(|(&a, &b)| a as f64 * b as f64).sum();
            if e > 0.0 {
                periodic += (c / e * n as f64 / (n - period) as f64).clamp(0.0, 1.0);
            }
        }
        frames += 1;
    }
    if frames == 0 {
        return None;
    }
    // 平均した自己相関から、Levinson-Durbin で係数を求める（lpc::lpc と同じ計算を、自己相関から行う）。
    // 雑音の少ない音を高い次数で解くと不安定になるので、ラグ窓で山の幅を少し広げ、0 番目を少し大きくする（雑音の床）
    let r: Vec<f64> = acc
        .iter()
        .enumerate()
        .map(|(k, &v)| {
            let lag = std::f64::consts::TAU * LAG_WINDOW_HZ * k as f64 / sample_rate as f64;
            v / frames as f64 * (-0.5 * lag * lag).exp() * if k == 0 { 1.0 + NOISE_FLOOR } else { 1.0 }
        })
        .collect();
    let a = levinson(&r)?;
    let rms = (x.iter().map(|&v| v as f64 * v as f64).sum::<f64>() / x.len() as f64).sqrt() as f32;
    let noise = (1.0 - (periodic / frames as f64) as f32).clamp(NOISE_MIN, NOISE_MAX);
    Some(VowelModel { sample_rate, f0: median, wobble, lpc: a, noise, rms })
}

/// 自己相関 r[0..=order] から LPC 係数を求める
fn levinson(r: &[f64]) -> Option<Vec<f32>> {
    // lpc::lpc は信号から自己相関を作るので、自己相関から始める版をここに置く
    let order = r.len() - 1;
    let mut a = vec![0.0f64; order + 1];
    a[0] = 1.0;
    let mut err = r[0];
    if err <= 0.0 {
        return None;
    }
    for i in 1..=order {
        let acc: f64 = (1..i).map(|j| a[j] * r[i - j]).sum();
        let k = -(r[i] + acc) / err;
        let prev = a.clone();
        for j in 1..i {
            a[j] = prev[j] + k * prev[i - j];
        }
        a[i] = k;
        err *= 1.0 - k * k;
        if err <= 0.0 {
            return None;
        }
    }
    Some(a.iter().map(|&v| v as f32).collect())
}

/// 母音を、高さ `f0`（Hz）と長さ `dur`（秒）で作る。サンプルレートは素材のもの
pub fn synth_vowel(m: &VowelModel, f0: f32, dur: f32) -> Vec<f32> {
    let sr = m.sample_rate;
    let len = (dur * sr) as usize;
    if len == 0 {
        return Vec::new();
    }
    let hop = f0::HOP_SEC * sr;
    let nyquist = sr / 2.0;
    // 声帯の音: F0 の倍音の和（帯域を限るので折り返さない）と、かすれの雑音。素材の揺れを繰り返して使う
    let mut src = vec![0.0f32; len];
    let mut phase = 0.0f64;
    let mut seed = 0x1234_5678u32;
    for (i, v) in src.iter_mut().enumerate() {
        let w = if m.wobble.is_empty() { 0.0 } else { m.wobble[(i as f32 / hop) as usize % m.wobble.len()] };
        let hz = f0 * 2f32.powf(w / 1200.0);
        phase += std::f64::consts::TAU * hz as f64 / sr as f64;
        let harmonics = (nyquist / hz) as usize;
        let mut s = 0.0f32;
        for k in 1..=harmonics {
            s += (phase * k as f64).cos() as f32;
        }
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        let noise = (seed >> 9) as f32 / (1u32 << 23) as f32 - 0.5;
        // 倍音の和は大きさが倍音の数に比例するので、数でならしてから雑音と混ぜる
        *v = (1.0 - m.noise) * s / (harmonics as f32).sqrt() + m.noise * noise * 2.0;
    }
    // 響き（全極フィルター）を掛け、プリエンファシスを戻す
    let mut out = vec![0.0f32; len];
    lpc::synthesize(&m.lpc, &src, &mut vec![0.0; m.lpc.len() - 1], &mut out);
    let mut prev = 0.0f32;
    for v in out.iter_mut() {
        *v += PRE * prev;
        prev = *v;
    }
    // 大きさを素材にそろえ、両端をフェードする
    let rms = (out.iter().map(|&v| v as f64 * v as f64).sum::<f64>() / len as f64).sqrt() as f32;
    let gain = if rms > 0.0 { m.rms / rms } else { 0.0 };
    let fade = ((FADE_SEC * sr) as usize).min(len / 2).max(1);
    for (i, v) in out.iter_mut().enumerate() {
        let edge = (i.min(len - 1 - i) as f32 / fade as f32).min(1.0);
        *v *= gain * edge;
    }
    out
}

/// 試し: 素材の母音を、元の高さ、4 半音上、7 半音上で 1 秒ずつ作り直して並べる（間に 0.2 秒の無音）。
/// 開発者向けの入口で聴いて確かめるためのもの。声のある所がなければ空
pub fn demo(x: &[f32], sample_rate: f32) -> Vec<f32> {
    let Some(m) = analyze_vowel(x, sample_rate) else { return Vec::new() };
    let gap = vec![0.0f32; (0.2 * sample_rate) as usize];
    let mut out = Vec::new();
    for semis in [0.0f32, 4.0, 7.0] {
        out.extend(synth_vowel(&m, m.f0 * 2f32.powf(semis / 12.0), 1.0));
        out.extend_from_slice(&gap);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use wevocal_lib::resample;

    /// F0 `f0` の倍音を、3 つの共振（フォルマント）に通した母音
    fn vowel(sr: f32, f0: f32, sec: f32, formants: &[(f32, f32)]) -> Vec<f32> {
        let len = (sr * sec) as usize;
        let mut x: Vec<f32> = (0..len)
            .map(|i| {
                let t = i as f32 / sr;
                (1..((sr / 2.0 / f0) as usize)).map(|k| (std::f32::consts::TAU * f0 * k as f32 * t).cos()).sum::<f32>() * 0.01
            })
            .collect();
        for &(f, bw) in formants {
            let r = (-std::f32::consts::PI * bw / sr).exp();
            let c = 2.0 * r * (std::f32::consts::TAU * f / sr).cos();
            let (mut y1, mut y2) = (0.0f32, 0.0f32);
            for v in x.iter_mut() {
                let y = *v + c * y1 - r * r * y2;
                y2 = y1;
                y1 = y;
                *v = y;
            }
        }
        let peak = x.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        x.iter().map(|v| v / peak * 0.5).collect()
    }

    /// LPC の包絡の山（低い方から 3 つ、Hz）。11025Hz に間引いて次数 13 で見る（Analyzer のフォルマント推定と同じ考え方）
    fn formants_of(x: &[f32], sr: f32) -> Vec<f32> {
        let ratio = (sr / 11025.0) as f64;
        let y = resample(x, ratio, (x.len() as f64 / ratio) as usize);
        let mid = y.len() / 2;
        let w = hann(300);
        let frame: Vec<f32> = (0..300).map(|i| (y[mid + i] - PRE * y[mid + i - 1]) * w[i]).collect();
        let (a, _) = lpc::lpc(&frame, 13).unwrap();
        let env = lpc::envelope(&a, 512);
        (1..511).filter(|&g| env[g] > env[g - 1] && env[g] >= env[g + 1]).map(|g| g as f32 / 511.0 * 11025.0 / 2.0).filter(|&hz| hz > 150.0).take(3).collect()
    }

    /// 素材の母音（F0 150Hz）を分析し、別の高さ（220Hz）で作り直しても、フォルマントの位置が近いこと
    #[test]
    fn keeps_formants_at_new_pitch() {
        let sr = 44100.0;
        let target = [(700.0f32, 80.0f32), (1200.0, 90.0), (2600.0, 120.0)];
        let x = vowel(sr, 150.0, 0.6, &target);
        let m = analyze_vowel(&x, sr).expect("voiced");
        assert!((m.f0 - 150.0).abs() < 5.0, "f0 {}", m.f0);
        let y = synth_vowel(&m, 220.0, 0.5);
        let got = formants_of(&y, sr);
        assert_eq!(got.len(), 3, "got {got:?}");
        for (g, (want, _)) in got.iter().zip(target) {
            assert!((g - want).abs() < want * 0.12, "got {got:?}");
        }
        // 大きさは素材とそろう
        let rms = (y.iter().map(|&v| v * v).sum::<f32>() / y.len() as f32).sqrt();
        assert!((rms / m.rms - 1.0).abs() < 0.2, "rms {rms} vs {}", m.rms);
    }

    #[test]
    fn silence_has_no_model() {
        assert!(analyze_vowel(&vec![0.0; 44100], 44100.0).is_none());
    }
}
