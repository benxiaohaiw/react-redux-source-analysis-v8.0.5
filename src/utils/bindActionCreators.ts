import { ActionCreatorsMapObject, Dispatch } from 'redux'

/// 绑定action创建者
export default function bindActionCreators(
  actionCreators: ActionCreatorsMapObject,
  dispatch: Dispatch
): ActionCreatorsMapObject {

  // 准备一个空对象
  const boundActionCreators: ActionCreatorsMapObject = {}

  // 遍历这个对象
  for (const key in actionCreators) {
    // 取出值
    const actionCreator = actionCreators[key]
    // 函数类型才可以
    if (typeof actionCreator === 'function') {
      // 然后包裹一下 - 内部就是自动使用dispatch函数然后调用执行用户写的actionCreator函数并把参数进行传递 // +++
      boundActionCreators[key] = (...args) => dispatch(actionCreator(...args)) // +++ 重点 // +++
    }
  }
  
  /// 最终返回这个新的对象 // +++
  return boundActionCreators
}
