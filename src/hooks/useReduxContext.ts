import { useContext } from 'react'
import { ReactReduxContext } from '../components/Context'
import type { ReactReduxContextValue } from '../components/Context'

/**
 * A hook to access the value of the `ReactReduxContext`. This is a low-level
 * hook that you should usually not need to call directly.
 *
 * @returns {any} the value of the `ReactReduxContext`
 *
 * @example
 *
 * import React from 'react'
 * import { useReduxContext } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const { store } = useReduxContext()
 *   return <div>{store.getState()}</div>
 * }
 */
export function useReduxContext(): ReactReduxContextValue | null {
  const contextValue = useContext(ReactReduxContext) // 使用useContext hook对src/components/Context.ts下的ReactReduxContext作为参数 // +++

  if (process.env.NODE_ENV !== 'production' && !contextValue) {
    throw new Error(
      'could not find react-redux context value; please ensure the component is wrapped in a <Provider>'
    )
  }

  // 返回值 // +++
  // Provider函数式组件中在Context.Provider传递的value对象
  return contextValue
}
