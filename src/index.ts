// The primary entry point assumes we're working with standard ReactDOM/RN, but
// older versions that do not include `useSyncExternalStore` (React 16.9 - 17.x).
// Because of that, the useSyncExternalStore compat shim is needed.

import { useSyncExternalStore } from 'use-sync-external-store/shim' // +++
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector' // +++

import { unstable_batchedUpdates as batch } from './utils/reactBatchedUpdates'
import { setBatch } from './utils/batch'

import { initializeUseSelector } from './hooks/useSelector'
import { initializeConnect } from './components/connect'

// 初始化useSyncExternalStoreWithSelector
initializeUseSelector(useSyncExternalStoreWithSelector) // ./hooks/useSelector
// 实际上就是react/packages/use-sync-external-store/src/useSyncExternalStoreWithSelector.js下的useSyncExternalStoreWithSelector函数
// 注意和useSyncExternalStore是相同的，但是支持selector和isEqual参数 - 实际上它的内部就是使用了useSyncExternalStore hook

// 初始化useSyncExternalStore
initializeConnect(useSyncExternalStore) // ./components/connect
// 实际上就是react hooks中的useSyncExternalStore hook

// 在订阅中启用批处理更新，以便与标准React渲染器一起使用（ReactDOM, React Native）
// Enable batched updates in our subscriptions for use
// with standard React renderers (ReactDOM, React Native)
setBatch(batch)
// 设置batch函数 // +++
// 其实就是react-dom下的unstable_batchedUpdates函数 // +++

export { batch } // +++

/* 
https://redux-toolkit.js.org/usage/usage-guide
https://github.com/reduxjs/redux-thunk
https://redux.js.org/usage/writing-logic-thunks
https://redux.js.org/
https://react-redux.js.org/api/connect#connect-parameters
https://redux-saga.js.org/
https://github.com/redux-saga/redux-saga/tree/main
*/

export * from './exports'
