// 默认为仅运行回调的虚拟“批处理”实现
// Default to a dummy "batch" implementation that just runs the callback
function defaultNoopBatch(callback: () => void) {
  callback()
}

let batch = defaultNoopBatch

// 允许稍后注入另一个批处理函数
// Allow injecting another batching function later
export const setBatch = (newBatch: typeof defaultNoopBatch) =>
  (batch = newBatch)
  // 将在src/index.ts中进行设置批量函数 // +++
  // 实际上就是react-dom下的unstable_batchedUpdates函数 // +++

// 提供一个 getter 以跳过处理 ESM 绑定
// Supply a getter just to skip dealing with ESM bindings
export const getBatch = () => batch
