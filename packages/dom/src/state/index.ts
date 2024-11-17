import { invariant } from "hey-listen"
import { noop } from "@motionone/utils"
import { animateStyle } from "../animate/animate-style"
import { style } from "../animate/style"
import {
  AnimationFactory,
  AnimationOptionsWithOverrides,
  MotionKeyframes,
} from "../animate/types"
import { getOptions } from "../animate/utils/options"
import { MotionState, MotionStateContext, Options, Variant } from "./types"
import { hasChanged } from "./utils/has-changed"
import { resolveVariant } from "./utils/resolve-variant"
import { scheduleAnimation, unscheduleAnimation } from "./utils/schedule"
import { inView } from "./gestures/in-view"
import { hover } from "./gestures/hover"
import { press } from "./gestures/press"
import { motionEvent } from "./utils/events"
import { Animation } from "@motionone/animation"

interface GestureSubscriptions {
  [key: string]: VoidFunction
}

const gestures = { inView, hover, press }

/**
 * A list of state types, in priority order. If a value is defined in
 * a righter-most type, it will override any definition in a lefter-most.
 */
const stateTypes = ["initial", "animate", ...Object.keys(gestures), "exit"]

/**
 * A global store of all generated motion states. This can be used to lookup
 * a motion state for a given Element.
 */
export const mountedStates = new WeakMap<Element, MotionState>()

export function createMotionState(
  options: Options = {},
  parent?: MotionState
): MotionState {
  /**
   * The element represented by the motion state. This is an empty reference
   * when we create the state to support SSR and allow for later mounting
   * in view libraries.
   *
   * @ts-ignore
   */
  let element: Element

  /**
   * Calculate a depth that we can use to order motion states by tree depth.
   */
  let depth = parent ? parent.getDepth() + 1 : 0

  /**
   * Track which states are currently active.
   */
  const activeStates = { initial: true, animate: true }

  /**
   * A map of functions that, when called, will remove event listeners for
   * a given gesture.
   */
  const gestureSubscriptions: GestureSubscriptions = {}

  /**
   * Initialise a context to share through motion states. This
   * will be populated by variant names (if any).
   */
  const context: MotionStateContext = {}
  for (const name of stateTypes) {
    context[name as keyof typeof context] =
      typeof options[name as keyof typeof options] === "string"
        ? options[name as keyof typeof options]
        : (parent?.getContext()[name as keyof typeof context] as any)
  }

  /**
   * If initial is set to false we use the animate prop as the initial
   * animation state.
   */
  const initialVariantSource = options.initial === false ? "animate" : "initial"

  /**
   * Destructure an initial target out from the resolved initial variant.
   */
  let { transition: initialTransition, ...target } =
    resolveVariant(
      options[initialVariantSource] || context[initialVariantSource],
      options.variants
    ) || {}

  /**
   * The base target is a cached map of values that we'll use to animate
   * back to if a value is removed from all active state types. This
   * is usually the initial value as read from the DOM, for instance if
   * it hasn't been defined in initial.
   */
  const baseTarget: Variant = { ...target }

  /**
   * A generator that will be processed by the global animation scheduler.
   * This yields when it switches from reading the DOM to writing to it
   * to prevent layout thrashing.
   */
  function* animateUpdates() {
    const prevTarget = target
    target = {}

    const resolvedVariants: { [key: string]: Variant } = {}
    const enteringInto: { [key: string]: string } = {}
    const animationOptions: AnimationOptionsWithOverrides = {}
    for (const name of stateTypes) {
      if (!activeStates[name as keyof typeof activeStates]) continue

      const variant = resolveVariant(
        options[name as keyof typeof options] as any,
        options.variants
      )

      if (!variant) continue

      resolvedVariants[name] = variant

      for (const key in variant) {
        if (key === "transition") continue

        target[key as keyof typeof target] = variant[
          key as keyof typeof variant
        ] as any

        animationOptions[key as any] = getOptions(
          variant.transition ?? options.transition ?? {},
          key
        )

        /**
         * Mark which state type this value is animating into.
         */
        enteringInto[key] = name
      }
    }

    const allTargetKeys = new Set([
      ...Object.keys(target),
      ...Object.keys(prevTarget),
    ])

    const animationFactories: AnimationFactory[] = []
    allTargetKeys.forEach((key: any) => {
      if (target[key] === undefined) {
        target[key] = baseTarget[key]
      }

      if (hasChanged(prevTarget[key], target[key])) {
        baseTarget[key] ??= style.get(element, key) as string

        animationFactories.push(
          animateStyle(
            element,
            key,
            target[key],
            animationOptions[key],
            Animation
          )
        )
      }
    })

    // Wait for all animation states to read from the DOM
    yield

    const animations = animationFactories
      .map((factory) => factory())
      .filter(Boolean)

    if (!animations.length) return

    const animationTarget = target
    element.dispatchEvent(motionEvent("motionstart", animationTarget))

    Promise.all(animations.map((animation: any) => animation.finished))
      .then(() => {
        element.dispatchEvent(motionEvent("motioncomplete", animationTarget))
      })
      .catch(noop)
  }

  const setGesture = (name: string, isActive: boolean) => () => {
    activeStates[name as keyof typeof activeStates] = isActive
    scheduleAnimation(state)
  }

  const updateGestureSubscriptions = () => {
    for (const name in gestures) {
      const isGestureActive =
        gestures[name as keyof typeof gestures].isActive(options)
      const remove = gestureSubscriptions[name]

      if (isGestureActive && !remove) {
        gestureSubscriptions[name] = gestures[
          name as keyof typeof gestures
        ].subscribe(
          element,
          {
            enable: setGesture(name, true),
            disable: setGesture(name, false),
          },
          options
        )
      } else if (!isGestureActive && remove) {
        remove()
        delete gestureSubscriptions[name]
      }
    }
  }

  const state: MotionState = {
    update: (newOptions) => {
      if (!element) return
      options = newOptions

      updateGestureSubscriptions()
      scheduleAnimation(state)
    },
    setActive: (name, isActive) => {
      if (!element) return
      activeStates[name as keyof typeof activeStates] = isActive
      scheduleAnimation(state)
    },
    animateUpdates,
    getDepth: () => depth,
    getTarget: () => target as MotionKeyframes,
    getOptions: () => options,
    getContext: () => context,
    mount: (newElement) => {
      invariant(
        Boolean(newElement),
        "Animation state must be mounted with valid Element"
      )

      element = newElement
      mountedStates.set(element, state)
      updateGestureSubscriptions()

      return () => {
        mountedStates.delete(element)
        unscheduleAnimation(state)

        for (const key in gestureSubscriptions) {
          gestureSubscriptions[key]()
        }
      }
    },
    isMounted: () => Boolean(element),
  }

  return state
}
