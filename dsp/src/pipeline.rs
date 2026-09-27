//! ピッチ変更・時間伸縮・フォルマント補正をまとめた処理の流れ。

use crate::{formant, pv, resample, wsola_map, wsola_with_progress, TimeMap};

/// `semitones` 半音のピッチ変更と `stretch` 倍の時間伸縮を1パスで行う。
/// 出力長はピッチ変更に関係なく 入力長 × stretch。
pub fn process(
    channels: &[&[f32]],
    sample_rate: f32,
    semitones: f64,
    stretch: f64,
) -> Vec<Vec<f32>> {
    process_with_progress(
        channels,
        sample_rate,
        semitones,
        stretch,
        Algorithm::Wsola,
        Formant::Follow,
        &mut |_| {},
    )
}

/// 伸縮と、ピッチ変更（リサンプル前の伸縮）の両方に使う時間伸縮方式。
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Algorithm {
    Wsola,
    PhaseVocoder,
}

impl Algorithm {
    pub fn from_id(id: u32) -> Self {
        if id == 1 {
            Algorithm::PhaseVocoder
        } else {
            Algorithm::Wsola
        }
    }

    pub(crate) fn stretch(
        self,
        channels: &[&[f32]],
        alpha: f64,
        sr: f32,
        progress: &mut dyn FnMut(f64),
    ) -> Vec<Vec<f32>> {
        match self {
            Algorithm::Wsola => wsola_with_progress(channels, alpha, sr, progress),
            Algorithm::PhaseVocoder => pv::stretch(channels, alpha, sr, progress),
        }
    }

    pub(crate) fn stretch_map(
        self,
        channels: &[&[f32]],
        map: &TimeMap,
        sr: f32,
        progress: &mut dyn FnMut(f64),
    ) -> Vec<Vec<f32>> {
        match self {
            Algorithm::Wsola => wsola_map(channels, map, sr, progress),
            Algorithm::PhaseVocoder => pv::stretch_map(channels, map, sr, progress),
        }
    }
}

/// `process_with_progress` でのフォルマントの扱い。
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Formant {
    /// フォルマントはピッチと一緒に動く（単純なリサンプル）。
    Follow,
    /// フォルマントを保持し、さらにこの半音数だけ移動する（0 = 保持のみ）。
    Shift(f64),
}

/// 全体の進捗（0〜1）を `progress` に通知する版の `process`。
pub fn process_with_progress(
    channels: &[&[f32]],
    sample_rate: f32,
    semitones: f64,
    stretch: f64,
    algorithm: Algorithm,
    formant: Formant,
    progress: &mut dyn FnMut(f64),
) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    let target_len = (len as f64 * stretch).round() as usize;
    let ratio = 2f64.powf(semitones / 12.0);
    let pitch = (ratio - 1.0).abs() > 1e-9;
    // リサンプル前に適用する包絡の変形率（`formant` 参照）。
    let warp = match formant {
        Formant::Follow => 1.0,
        Formant::Shift(st) => ratio / 2f64.powf(st / 12.0),
    };
    let correct = (warp - 1.0).abs() > 1e-9;

    // 各段階の処理コストのおおよその比率。進捗表示にのみ使う。
    let stretch_share = if correct {
        0.5
    } else if pitch {
        0.6
    } else {
        1.0
    };
    let formant_share = if correct {
        if pitch {
            0.3
        } else {
            0.5
        }
    } else {
        0.0
    };
    let n = channels.len().max(1) as f64;

    let mut out = algorithm.stretch(channels, stretch * ratio, sample_rate, &mut |p| {
        progress(p * stretch_share)
    });
    if correct {
        for (i, c) in out.iter_mut().enumerate() {
            let base = stretch_share + formant_share * i as f64 / n;
            *c = formant::correct(c, warp, sample_rate, &mut |p| {
                progress(base + formant_share * p / n)
            });
        }
    }
    if pitch {
        let base = stretch_share + formant_share;
        for (i, c) in out.iter_mut().enumerate() {
            progress(base + (1.0 - base) * i as f64 / n);
            *c = resample(c, ratio, target_len);
        }
    }
    progress(1.0);
    out
}
