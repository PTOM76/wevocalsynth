// Rust の DSP クレートを wasm にビルドし、src/dsp にコピーする
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'

execSync('cargo build --release --target wasm32-unknown-unknown', { cwd: 'dsp', stdio: 'inherit' })
mkdirSync('src/dsp', { recursive: true })
copyFileSync('dsp/target/wasm32-unknown-unknown/release/wevocal_dsp.wasm', 'src/dsp/wevocal_dsp.wasm')
console.log('wasm -> src/dsp/wevocal_dsp.wasm')
