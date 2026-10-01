// モデルの入出力の名前と形を表示し、ダミー入力で1回推論して時間を測る（Node / CPU）
import * as ort from 'onnxruntime-node'
for (const p of process.argv.slice(2)) {
  const s = await ort.InferenceSession.create(p)
  console.log(p)
  console.log('  in :', s.inputNames, s.inputMetadata?.map((m) => [m.type, m.shape]))
  console.log('  out:', s.outputNames, s.outputMetadata?.map((m) => [m.type, m.shape]))
  const x = new ort.Tensor('float32', new Float32Array(2 * 1 * 512 * 1024).map(() => Math.random()), [2, 1, 512, 1024])
  const t0 = performance.now()
  const r = await s.run({ [s.inputNames[0]]: x })
  const y = r[s.outputNames[0]]
  console.log(`  run: ${(performance.now() - t0).toFixed(0)} ms (512 frames = ${(512 * 1024 / 44100).toFixed(1)} s), out ${y.type} ${y.dims}`)
}
