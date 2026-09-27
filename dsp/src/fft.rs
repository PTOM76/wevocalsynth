//! スペクトル処理で共用する最小限の radix-2 FFT。

use std::f64::consts::PI;

/// 実部・虚部を分けた配列に対するインプレース反復型 radix-2 FFT。
pub struct Fft {
    n: usize,
    cos: Vec<f32>,
    sin: Vec<f32>,
    rev: Vec<usize>,
}

impl Fft {
    pub fn new(n: usize) -> Self {
        let bits = n.trailing_zeros();
        let rev = (0..n)
            .map(|i| i.reverse_bits() >> (usize::BITS - bits))
            .collect();
        let cos = (0..n / 2)
            .map(|i| (2.0 * PI * i as f64 / n as f64).cos() as f32)
            .collect();
        let sin = (0..n / 2)
            .map(|i| (2.0 * PI * i as f64 / n as f64).sin() as f32)
            .collect();
        Fft { n, cos, sin, rev }
    }

    /// `inverse` が false なら順変換。逆変換はスケーリングしない（呼び出し側で 1/n する）。
    pub fn run(&self, re: &mut [f32], im: &mut [f32], inverse: bool) {
        let n = self.n;
        for i in 0..n {
            let j = self.rev[i];
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let sign = if inverse { 1.0 } else { -1.0 };
        let mut size = 2;
        while size <= n {
            let half = size / 2;
            let step = n / size;
            for start in (0..n).step_by(size) {
                for k in 0..half {
                    let (wr, wi) = (self.cos[k * step], sign * self.sin[k * step]);
                    let (a, b) = (start + k, start + k + half);
                    let tr = re[b] * wr - im[b] * wi;
                    let ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            size *= 2;
        }
    }
}
