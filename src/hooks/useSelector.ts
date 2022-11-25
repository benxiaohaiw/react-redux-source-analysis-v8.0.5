import { useContext, useDebugValue } from 'react'

import { useReduxContext as useDefaultReduxContext } from './useReduxContext'
import { ReactReduxContext } from '../components/Context'
import type { EqualityFn, NoInfer } from '../types'
import type { uSESWS } from '../utils/useSyncExternalStore'
import { notInitialized } from '../utils/useSyncExternalStore'

let useSyncExternalStoreWithSelector = notInitialized as uSESWS

// 初始化useSyncExternalStoreWithSelector
// 将在src/index.ts中进行初始化 // +++
// +++
// 实际上就是react/packages/use-sync-external-store/src/useSyncExternalStoreWithSelector.js下的useSyncExternalStoreWithSelector函数
// 注意和useSyncExternalStore是相同的，但是支持selector和isEqual参数 - 实际上它的内部就是使用了useSyncExternalStore hook
export const initializeUseSelector = (fn: uSESWS) => {
  useSyncExternalStoreWithSelector = fn
}

// +++
const refEquality: EqualityFn<any> = (a, b) => a === b // +++

/**
 * Hook factory, which creates a `useSelector` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useSelector` hook bound to the specified context.
 */
export function createSelectorHook(
  context = ReactReduxContext // 要注意context的默认为ReactReduxContext！！！ // +++
): <TState = unknown, Selected = unknown>(
  selector: (state: TState) => Selected,
  equalityFn?: EqualityFn<Selected>
) => Selected {
  // +++
  // 
  const useReduxContext =
    context === ReactReduxContext // 相等的
      ? useDefaultReduxContext // +++ 就是这个了
      : () => useContext(context)

  // 返回一个函数
  return function useSelector<TState, Selected extends unknown>(
    selector: (state: TState) => Selected, // 选择器
    equalityFn: EqualityFn<NoInfer<Selected>> = refEquality // 相等函数默认为refEquality函数 // +++ 使用的就是 a === b
  ): Selected {
    if (process.env.NODE_ENV !== 'production') {
      if (!selector) {
        throw new Error(`You must pass a selector to useSelector`)
      }
      if (typeof selector !== 'function') {
        throw new Error(`You must pass a function as a selector to useSelector`)
      }
      if (typeof equalityFn !== 'function') {
        throw new Error(
          `You must pass a function as an equality function to useSelector`
        )
      }
    }

    // src/hooks/useReduxContext.ts下的useReduxContext // +++
    const { store, subscription, getServerState } = useReduxContext()!
    // Provider函数式组件中在Context.Provider传递的value对象

    // 实际上就是react/packages/use-sync-external-store/src/useSyncExternalStoreWithSelector.js下的useSyncExternalStoreWithSelector函数
    // 注意和useSyncExternalStore是相同的，但是支持selector和isEqual参数 - 实际上它的内部就是使用了useSyncExternalStore hook
    const selectedState = useSyncExternalStoreWithSelector(
      subscription.addNestedSub, // 使用的是订阅对象的【增加嵌套订阅】函数 // +++
      store.getState, // store对象的【获取状态】函数 // +++
      getServerState || store.getState,
      selector, // 选择器函数 // +++
      equalityFn // 相等函数 // +++
    )

    useDebugValue(selectedState)

    // 返回已选择状态 // +++
    return selectedState
  }
}

/**
 * A hook to access the redux store's state. This hook takes a selector function
 * as an argument. The selector is called with the store state.
 *
 * This hook takes an optional equality comparison function as the second parameter
 * that allows you to customize the way the selected state is compared to determine
 * whether the component needs to be re-rendered.
 *
 * @param {Function} selector the selector function
 * @param {Function=} equalityFn the function that will be used to determine equality
 *
 * @returns {any} the selected state
 *
 * @example
 *
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const counter = useSelector(state => state.counter)
 *   return <div>{counter}</div>
 * }
 */
export const useSelector = /*#__PURE__*/ createSelectorHook() // 创建选择器hook // +++
// undefined -> ReactReduxContext作为参数context啦 ~
