import { isExtracting, openExtractor, RUNTIME_ADDONS, VOCAL_MODELS, type ExtractOptions } from '../audio/vocalExtract'
import { addonFileUrl, installedManifest } from '../addons/addons'
import { releaseIdleDsp } from '../dsp/engine'
import { releasePlayers } from '../audio/usePlayer'
import { diagnoseCompile, diagnoseEnv, diagnoseMemory, diagnoseRuntime, webGpuAvailable, type Log, type RuntimePattern } from '../../extractor/src/diagnose'
import type { Backend } from '../../extractor/src/types'
import { backendAllowed } from '../../extractor/src/compat'
import type { VocalModel } from '../settings/settings'

/**
 * ボーカル抽出の診断（設定の開発者向け）。内容は extractor/src/diagnose.ts（Extractor と同じ）に、
 * 加工の Worker を残したままの抽出（いまの設定）を足したもの
 */
export async function diagnoseExtract(o: ExtractOptions, log: Log) {
  // 抽出中に作ると、抽出のモデルを入れ替えてしまう
  if (isExtracting()) return log('抽出中のため診断できません。抽出が終わってから実行してください')
  diagnoseEnv(log)
  await diagnoseMemory(log)
  const runtime = await installedManifest('vocal-extractor')
  if (!runtime) {
    log('ボーカル抽出の実行環境が未導入のため、実行環境の試しは省略')
    return
  }
  // 計算の種類ごとの ONNX Runtime（追加機能）。入っているものだけ試す
  const backends: Backend[] = []
  for (const [backend, id] of [['wasm', RUNTIME_ADDONS.cpu], ['webgpu', RUNTIME_ADDONS.gpu]] as const) {
    const wasm = (await installedManifest(id))?.files.find((f) => f.path.endsWith('.wasm'))
    if (!wasm) {
      log(`${id} が未導入のため、${backend} の組み合わせは省略`)
      continue
    }
    if (backend === 'webgpu' && !(await webGpuAvailable())) {
      log('WebGPU が使えないため、WebGPU の組み合わせは省略')
      continue
    }
    await diagnoseCompile(await (await fetch(addonFileUrl(id, wasm.path))).arrayBuffer(), log)
    backends.push(backend)
  }
  const current: Backend = o.gpu && backendAllowed(o.model, 'webgpu') && backends.includes('webgpu') ? 'webgpu' : 'wasm'
  if (backends.includes(current)) await diagnoseRuntime([{ label: `${o.model}、${current}`, create: () => openExtractor(o, current) }], log, '、いまの設定、加工の Worker を残したまま')
  releaseIdleDsp()
  releasePlayers()
  await new Promise((r) => setTimeout(r, 3000))
  // モデル 3 種類と、WebGPU を使う / 使わないの 6 通り（fp16 の WebGPU は出力が 0 になるが、作れるかは試す）
  const patterns: RuntimePattern[] = []
  for (const model of Object.keys(VOCAL_MODELS) as VocalModel[]) {
    if (!(await installedManifest(VOCAL_MODELS[model].addon))) {
      log(`モデル ${model} は未導入のため省略`)
      continue
    }
    for (const backend of backends) patterns.push({ label: `${model}、${backend}`, create: () => openExtractor({ ...o, model }, backend) })
  }
  await diagnoseRuntime(patterns, log, '、加工の Worker を止めたあと')
}