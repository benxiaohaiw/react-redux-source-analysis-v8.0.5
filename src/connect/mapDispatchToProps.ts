import type { Action, Dispatch } from 'redux'
import bindActionCreators from '../utils/bindActionCreators'
import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'
import { createInvalidArgFactory } from './invalidArgFactory'
import type { MapDispatchToPropsParam } from './selectorFactory'

// +++
export function mapDispatchToPropsFactory<TDispatchProps, TOwnProps>(
  mapDispatchToProps:
    | MapDispatchToPropsParam<TDispatchProps, TOwnProps>
    | undefined
) {
  return mapDispatchToProps && typeof mapDispatchToProps === 'object'
      // 是个对象则返回一个initConstantSelector函数
    ? wrapMapToPropsConstant((dispatch: Dispatch<Action<unknown>>) => /** getConstant参数函数 */
        // @ts-ignore
        bindActionCreators(mapDispatchToProps, dispatch) // 绑定action创建者 - 其实就是把用户写的函数进行包裹 - 内部自动给你dispatch函数的执行调用 // +++
      )
    : !mapDispatchToProps
      // 没有返回一个initConstantSelector函数
    ? wrapMapToPropsConstant((dispatch: Dispatch<Action<unknown>>) => ({ /** getConstant参数函数 */
        dispatch,
      }))
      // 是一个函数
    : typeof mapDispatchToProps === 'function'
    ? // @ts-ignore
      wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps') // +++ 返回initProxySelector函数
      // 创建无效参数
    : createInvalidArgFactory(mapDispatchToProps, 'mapDispatchToProps')
}
