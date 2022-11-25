import type { Action, Dispatch } from 'redux'
import verifyPlainObject from '../utils/verifyPlainObject'
import { createInvalidArgFactory } from './invalidArgFactory'
import type { MergeProps } from './selectorFactory'
import type { EqualityFn } from '../types'

// 默认合并属性函数
export function defaultMergeProps<
  TStateProps,
  TDispatchProps,
  TOwnProps,
  TMergedProps
>(
  stateProps: TStateProps,
  dispatchProps: TDispatchProps,
  ownProps: TOwnProps
): TMergedProps {
  // @ts-ignore
  return { ...ownProps, ...stateProps, ...dispatchProps } // 就是把三个对象合并到一个对象中 // +++
}

// 包裹合并属性函数 // +++
export function wrapMergePropsFunc<
  TStateProps,
  TDispatchProps,
  TOwnProps,
  TMergedProps
>(
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
): (
  dispatch: Dispatch<Action<unknown>>,
  options: {
    readonly displayName: string
    readonly areMergedPropsEqual: EqualityFn<TMergedProps>
  }
) => MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> {

  // 返回一个函数 /// +++
  return function initMergePropsProxy(
    dispatch,
    { displayName, areMergedPropsEqual }
  ) {
    let hasRunOnce = false // 没有运行一次
    let mergedProps: TMergedProps // 合并的属性

    // 直接返回一个函数
    return function mergePropsProxy(
      stateProps: TStateProps,
      dispatchProps: TDispatchProps,
      ownProps: TOwnProps
    ) {

      // 直接调用用户写的mergeProps函数
      const nextMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

      // 有运行一次
      if (hasRunOnce) {
        if (!areMergedPropsEqual(nextMergedProps, mergedProps)) // 不是相等的
          mergedProps = nextMergedProps // 赋值为新的
      } else {
        // 标记为true // +++
        hasRunOnce = true
        // 赋值
        mergedProps = nextMergedProps

        if (process.env.NODE_ENV !== 'production')
          verifyPlainObject(mergedProps, displayName, 'mergeProps')
      }

      // 返回
      return mergedProps
    }
  }
}

// 合并属性 // +++
export function mergePropsFactory<
  TStateProps,
  TDispatchProps,
  TOwnProps,
  TMergedProps
>(
  mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
) {

  // +++
  return !mergeProps // 没有
    ? () => defaultMergeProps // 箭头函数 - 其返回defaultMergeProps函数 - 其作用就是就是把三个参数对象合并到一个对象中
    : typeof mergeProps === 'function' // 它是一个函数
    ? wrapMergePropsFunc(mergeProps) // 包裹合并属性函数 /// +++
    : createInvalidArgFactory(mergeProps, 'mergeProps') // // 创建无效参数
}
