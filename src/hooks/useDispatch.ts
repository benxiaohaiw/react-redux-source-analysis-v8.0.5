import { Action, AnyAction, Dispatch } from 'redux'
import { Context } from 'react'

import {
  ReactReduxContext,
  ReactReduxContextValue,
} from '../components/Context'
import { useStore as useDefaultStore, createStoreHook } from './useStore'

/**
 * Hook factory, which creates a `useDispatch` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useDispatch` hook bound to the specified context.
 */
export function createDispatchHook<
  S = unknown,
  A extends Action = AnyAction
  // @ts-ignore
>(context?: Context<ReactReduxContextValue<S, A>> = ReactReduxContext) { // 要注意context的默认为ReactReduxContext！！！ // +++

  // 和src/components/Context.ts下的ReactReduxContext是相等的那么直接使用src/hooks/useStore.ts下的useStore hook
  const useStore =
    // @ts-ignore
    context === ReactReduxContext ? useDefaultStore : createStoreHook(context)

  // 返回函数
  return function useDispatch<
    AppDispatch extends Dispatch<A> = Dispatch<A>
  >(): AppDispatch {
    // 得到store对象
    const store = useStore()
    // @ts-ignore
    return store.dispatch // 直接返回store对象的dispatch函数
    // 其实就是benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/applyMiddleware.ts下的dispatch变量指向的函数 // +++
  }
}

/**
 * A hook to access the redux `dispatch` function.
 *
 * @returns {any|function} redux store's `dispatch` function
 *
 * @example
 *
 * import React, { useCallback } from 'react'
 * import { useDispatch } from 'react-redux'
 *
 * export const CounterComponent = ({ value }) => {
 *   const dispatch = useDispatch()
 *   const increaseCounter = useCallback(() => dispatch({ type: 'increase-counter' }), [])
 *   return (
 *     <div>
 *       <span>{value}</span>
 *       <button onClick={increaseCounter}>Increase counter</button>
 *     </div>
 *   )
 * }
 */
export const useDispatch = /*#__PURE__*/ createDispatchHook() // 创建派发hook
// undefined -> ReactReduxContext作为参数context啦 ~
