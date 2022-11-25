import { ActionCreatorsMapObject, Dispatch, ActionCreator } from 'redux'

import { FixTypeLater } from '../types'
import verifyPlainObject from '../utils/verifyPlainObject'

type AnyState = { [key: string]: any }
type StateOrDispatch<S extends AnyState = AnyState> = S | Dispatch

type AnyProps = { [key: string]: any }

export type MapToProps<P extends AnyProps = AnyProps> = {
  // eslint-disable-next-line no-unused-vars
  (stateOrDispatch: StateOrDispatch, ownProps?: P): FixTypeLater
  dependsOnOwnProps?: boolean
}

// +++
export function wrapMapToPropsConstant(
  // * Note:
  //  It seems that the dispatch argument
  //  could be a dispatch function in some cases (ex: whenMapDispatchToPropsIsMissing)
  //  and a state object in some others (ex: whenMapStateToPropsIsMissing)
  // eslint-disable-next-line no-unused-vars
  getConstant: (dispatch: Dispatch) =>
    | {
        dispatch?: Dispatch
        dependsOnOwnProps?: boolean
      }
    | ActionCreatorsMapObject
    | ActionCreator<any>
) {
  // 返回函数1
  return function initConstantSelector(dispatch: Dispatch) {
    const constant = getConstant(dispatch) // 获取常量 // 在src/connect/mapStateToProps.ts中传递的getConstant是一个() => ({})箭头函数 // +++

    // 准备函数2
    function constantSelector() {
      return constant // 返回常量 - 空对象
    }
    constantSelector.dependsOnOwnProps = false // 是一个false // +++

    // 返回函数2
    return constantSelector
  }
}

// dependsOnOwnProps is used by createMapToPropsProxy to determine whether to pass props as args
// to the mapToProps function being wrapped. It is also used by makePurePropsSelector to determine
// whether mapToProps needs to be invoked when props have changed.
//
// A length of one signals that mapToProps does not depend on props from the parent component.
// A length of zero is assumed to mean mapToProps is getting args via arguments or ...args and
// therefore not reporting its length accurately..
// TODO Can this get pulled out so that we can subscribe directly to the store if we don't need ownProps?
export function getDependsOnOwnProps(mapToProps: MapToProps) { // +++

  // +++
  return mapToProps.dependsOnOwnProps
    ? Boolean(mapToProps.dependsOnOwnProps)
    : mapToProps.length !== 1
}

// Used by whenMapStateToPropsIsFunction and whenMapDispatchToPropsIsFunction,
// this function wraps mapToProps in a proxy function which does several things:
//
//  * Detects whether the mapToProps function being called depends on props, which
//    is used by selectorFactory to decide if it should reinvoke on props changes.
//
//  * On first call, handles mapToProps if returns another function, and treats that
//    new function as the true mapToProps for subsequent calls.
//
//  * On first call, verifies the first result is a plain object, in order to warn
//    the developer that their mapToProps function is not returning a valid result.
//
export function wrapMapToPropsFunc<P extends AnyProps = AnyProps>(
  mapToProps: MapToProps,
  methodName: string
) {

  // 返回初始化代理选择器函数 // +++
  return function initProxySelector(
    dispatch: Dispatch,
    { displayName }: { displayName: string }
  ) {

    // 准备proxy函数
    const proxy = function mapToPropsProxy(
      stateOrDispatch: StateOrDispatch,
      ownProps?: P
    ): MapToProps {
      return proxy.dependsOnOwnProps // 
        ? proxy.mapToProps(stateOrDispatch, ownProps) // +++
        : proxy.mapToProps(stateOrDispatch, undefined)
    }

    // allow detectFactoryAndVerify to get ownProps
    proxy.dependsOnOwnProps = true // 标记为true // +++

    // 在proxy函数上添加mapToProps属性为一个函数
    proxy.mapToProps = function detectFactoryAndVerify(
      stateOrDispatch: StateOrDispatch,
      ownProps?: P
    ): MapToProps {

      proxy.mapToProps = mapToProps // 重新赋值为上面的参数mapToProps函数 // +++
      
      proxy.dependsOnOwnProps = getDependsOnOwnProps(mapToProps)
      /* 
      export function getDependsOnOwnProps(mapToProps: MapToProps) { // +++

        // +++
        return mapToProps.dependsOnOwnProps
          ? Boolean(mapToProps.dependsOnOwnProps) // 用户的函数上的dependsOnOwnProps属性
          : mapToProps.length !== 1 // 则根据用户写的函数的参数是否不为1来去进行判断的 // +++
      }
      */

      // 再次执行proxy函数 - 注意内部的mapToProps变为了上面传入的参数mapToProps了，也就是用户写的函数 // +++
      let props = proxy(stateOrDispatch, ownProps)

      // 支持值是一个函数
      if (typeof props === 'function') {
        proxy.mapToProps = props // 再次赋值
        proxy.dependsOnOwnProps = getDependsOnOwnProps(props)
        // 再次执行proxy函数 // +++
        props = proxy(stateOrDispatch, ownProps)
      }

      if (process.env.NODE_ENV !== 'production')
        verifyPlainObject(props, displayName, methodName)

      // 直接返回props值 // +++
      return props
    }

    // 返回proxy函数
    return proxy
  }
}
