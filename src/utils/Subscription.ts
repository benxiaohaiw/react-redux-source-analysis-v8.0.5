import { getBatch } from './batch'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

type VoidFunc = () => void

type Listener = {
  callback: VoidFunc
  next: Listener | null
  prev: Listener | null
}

// 创建监听器集合 // +++
function createListenerCollection() {

  // 获取批量函数 // +++
  const batch = getBatch()

  // 头部指向
  let first: Listener | null = null // 默认为null // +++
  // 尾部指向
  let last: Listener | null = null // 默认为null // +++

  // 返回一个对象 // +++
  return {
    // 清理
    clear() {
      // 直接重置first、last指向为null就好啦 ~
      first = null
      last = null
    },

    // 通知
    notify() {

      // 直接放在batch函数中进行执行 // +++

      // 包裹在批量函数中进行执行 // +++
      batch(() => {
        let listener = first
        // 依然是从头部开始单向遍历
        while (listener) {
          // 一一执行cb函数
          listener.callback()
          // 替换下一个
          listener = listener.next
        }
      })
    },

    // 获取
    get() {
      let listeners: Listener[] = []
      let listener = first // 从头部开始 // +++

      // 遍历这个双向链表 - 从【头部】开始【单向】遍历 // +++
      while (listener) {
        // 按其顺序添加进数组中 // +++
        listeners.push(listener)
        // 替换下一个的指向
        listener = listener.next
      }
      // 返回数组 // +++
      return listeners
    },

    // 订阅 
    subscribe(callback: () => void) {
      let isSubscribed = true // 是已订阅

      // 准备监听器对象 // +++
      let listener: Listener = (last = {
        callback,
        next: null,
        prev: last, // last刚开始默认为null // +++
      }) // 先构建左指向 // +++

      // 构建有关于监听器对象的【双向链表】 // +++
      if (listener.prev) {
        listener.prev.next = listener // 再构建右指向 // +++
      } else {
        first = listener
      }

      /* 
      first -> listener1 <- last
      first -> listener1 <-> listener2 <- last
      first -> listener1 <-> listener2 <-> listener3 <- last
      */

      // 返回取消订阅函数 // +++
      return function unsubscribe() {
        // 不是已订阅 或 first为null那么直接返回
        if (!isSubscribed || first === null) return

        // 标记没有订阅
        isSubscribed = false

        // 当前监听器对象是否有下一个指向
        if (listener.next) {
          // 有则直接把其下一个的上一个指向当前的上一个 ~
          listener.next.prev = listener.prev
        } else {
          // 没有下一个指向 - 直接把last指向为当前的上一个 ~
          last = listener.prev
        }

        // 主要就是将上方创建出来的监听器对象从【双向链表】中删除，然后维护好这个【双向链表】前后的指向 // +++

        // 当前是否有上一个
        if (listener.prev) {
          // 有则把上一个的下一个指向当前的下一个 ~
          listener.prev.next = listener.next
        } else {
          // 没有直接将first指向为当前的下一个 ~
          first = listener.next
        }
      }
    },
  }
}

type ListenerCollection = ReturnType<typeof createListenerCollection>

export interface Subscription {
  addNestedSub: (listener: VoidFunc) => VoidFunc
  notifyNestedSubs: VoidFunc
  handleChangeWrapper: VoidFunc
  isSubscribed: () => boolean
  onStateChange?: VoidFunc | null
  trySubscribe: VoidFunc
  tryUnsubscribe: VoidFunc
  getListeners: () => ListenerCollection
}

const nullListeners = {
  notify() {},
  get: () => [],
} as unknown as ListenerCollection

// 创建有关于store的订阅 // +++
export function createSubscription(store: any, parentSub?: Subscription) { // 注意这里还有一个可选参数parentSub，意为【父订阅对象】，它没有默认值 // +++

  // 取消订阅函数
  let unsubscribe: VoidFunc | undefined

  // 监听器集合
  let listeners: ListenerCollection = nullListeners

  // 增加嵌套的订阅
  function addNestedSub(listener: () => void) { // +++
    // 首先尝试订阅 // +++
    trySubscribe()
    // 然后使用监听器集合的订阅函数进行相关的订阅 // +++
    return listeners.subscribe(listener) // ++++++
  }

  // 通知嵌套的订阅
  function notifyNestedSubs() {
    // 直接执行监听器集合的通知函数 // +++
    listeners.notify()
  }

  // 处理改变包裹
  function handleChangeWrapper() {
    // 当前的订阅对象上必须有响应状态变化的钩子函数 // +++
    if (subscription.onStateChange) {
      subscription.onStateChange() // 直接执行就好了 // +++
    }
  }

  // 是否已订阅
  function isSubscribed() {
    // 直接看是否有取消订阅函数 // +++
    return Boolean(unsubscribe) // +++
  }

  // 尝试订阅
  function trySubscribe() {

    // 当前没有取消订阅函数才进行以下逻辑 // +++
    if (!unsubscribe) {

      // 是否有父订阅 ? 使用父订阅的增加嵌套订阅函数 : 否则使用store的订阅函数
      // 对应的监听器都是处理变化包裹函数 // +++
      unsubscribe = parentSub
        ? parentSub.addNestedSub(handleChangeWrapper)
        : store.subscribe(handleChangeWrapper)

      // 创建监听器集合
      listeners = createListenerCollection()
    }
  }

  // 尝试取消订阅
  function tryUnsubscribe() {
    // 是否有取消订阅函数
    if (unsubscribe) {
      // 先指向这个取消订阅函数
      unsubscribe()
      // 置为undefined
      unsubscribe = undefined
      // 同时调用监听器集合的clear函数
      listeners.clear()
      // 也是重置 // +++
      listeners = nullListeners
    }
  }

  // 准备一个订阅对象 // +++
  const subscription: Subscription = {
    // 众多函数 // +++
    addNestedSub,
    notifyNestedSubs,
    handleChangeWrapper,
    isSubscribed,
    trySubscribe,
    tryUnsubscribe,
    getListeners: () => listeners,
  }

  // 返回这个订阅对象 // +++
  return subscription
}
