import { getAnimationData, getMotionValue } from "./data"
import type { AnimationFactory, ValueKeyframesDefinition } from "./types"
import { isCssVar, registerCssVariable } from "./utils/css-var"
import { Animation } from "@motionone/animation"
import {
  defaults,
  time,
  isEasingGenerator,
  isEasingList,
} from "@motionone/utils"
import { AnimationOptions } from "@motionone/types"
import {
  addTransformToElement,
  isTransform,
  transformDefinitions,
} from "./utils/transforms"
import { convertEasing } from "./utils/easing"
import { supports } from "./utils/feature-detection"
import { hydrateKeyframes, keyframesList } from "./utils/keyframes"
import { style } from "./style"
import { getStyleName } from "./utils/get-style-name"
import { isNumber, noop } from "@motionone/utils"
import { stopAnimation } from "./utils/stop-animation"

function getDevToolsRecord() {
  return (window as any).__MOTION_DEV_TOOLS_RECORD
}

export function animateStyle(
  element: Element,
  key: string,
  keyframesDefinition: ValueKeyframesDefinition,
  options: AnimationOptions = {}
): AnimationFactory {
  const record = getDevToolsRecord()
  const isRecording = options.record !== false && record

  let animation: any
  let {
    duration = defaults.duration,
    delay = defaults.delay,
    endDelay = defaults.endDelay,
    repeat = defaults.repeat,
    easing = defaults.easing,
    direction,
    offset,
    allowWebkitAcceleration = false,
  } = options

  const data = getAnimationData(element)
  let canAnimateNatively = supports.waapi()
  const valueIsTransform = isTransform(key)

  /**
   * If this is an individual transform, we need to map its
   * key to a CSS variable and update the element's transform style
   */
  valueIsTransform && addTransformToElement(element as HTMLElement, key)
  const name = getStyleName(key)

  const motionValue = getMotionValue(data.values, name)

  /**
   * Get definition of value, this will be used to convert numerical
   * keyframes into the default value type.
   */
  const definition = transformDefinitions.get(name)

  /**
   * Stop the current animation, if any. Because this will trigger
   * commitStyles (DOM writes) and we might later trigger DOM reads,
   * this is fired now and we return a factory function to create
   * the actual animation that can get called in batch,
   */
  stopAnimation(
    motionValue.animation,
    !(isEasingGenerator(easing) && motionValue.generator) &&
      options.record !== false
  )

  /**
   * Batchable factory function containing all DOM reads.
   */
  return () => {
    const readInitialValue = () =>
      style.get(element, name) ?? definition?.initialValue ?? 0

    /**
     * Replace null values with the previous keyframe value, or read
     * it from the DOM if it's the first keyframe.
     */
    let keyframes = hydrateKeyframes(
      keyframesList(keyframesDefinition),
      readInitialValue
    )

    if (isEasingGenerator(easing)) {
      const custom = easing.createAnimation(
        keyframes,
        readInitialValue as any,
        valueIsTransform,
        name,
        motionValue
      )
      easing = custom.easing
      if (custom.keyframes !== undefined) keyframes = custom.keyframes
      if (custom.duration !== undefined) duration = custom.duration
    }

    /**
     * If this is a CSS variable we need to register it with the browser
     * before it can be animated natively. We also set it with setProperty
     * rather than directly onto the element.style object.
     */
    if (isCssVar(name)) {
      if (supports.cssRegisterProperty()) {
        registerCssVariable(name)
      } else {
        canAnimateNatively = false
      }
    }

    /**
     * If we can animate this value with WAAPI, do so. Currently this only
     * feature detects CSS.registerProperty but could check WAAPI too.
     */
    if (canAnimateNatively) {
      /**
       * Convert numbers to default value types. Currently this only supports
       * transforms but it could also support other value types.
       */
      if (definition) {
        keyframes = keyframes.map((value) =>
          isNumber(value) ? definition.toDefaultUnit!(value) : value
        )
      }

      /**
       * If this browser doesn't support partial/implicit keyframes we need to
       * explicitly provide one.
       */
      if (
        keyframes.length === 1 &&
        (!supports.partialKeyframes() || isRecording)
      ) {
        keyframes.unshift(readInitialValue())
      }

      const animationOptions = {
        delay: time.ms(delay as number),
        duration: time.ms(duration),
        endDelay: time.ms(endDelay),
        easing: !isEasingList(easing) ? convertEasing(easing) : undefined,
        direction,
        iterations: repeat + 1,
        fill: "both" as FillMode,
      }

      animation = element.animate(
        {
          [name]: keyframes,
          offset,
          easing: isEasingList(easing) ? easing.map(convertEasing) : undefined,
        } as PropertyIndexedKeyframes,
        animationOptions
      )

      /**
       * Polyfill finished Promise in browsers that don't support it
       */
      if (!animation.finished) {
        animation.finished = new Promise((resolve, reject) => {
          animation.onfinish = resolve
          animation.oncancel = reject
        })
      }

      animation.finished
        .then(() => {
          animation.commitStyles()
          animation.cancel()
        })
        .catch(noop)

      /**
       * This forces Webkit to run animations on the main thread by exploiting
       * this condition:
       * https://trac.webkit.org/browser/webkit/trunk/Source/WebCore/platform/graphics/ca/GraphicsLayerCA.cpp?rev=281238#L1099
       *
       * This fixes Webkit's timing bugs, like accelerated animations falling
       * out of sync with main thread animations and massive delays in starting
       * accelerated animations in WKWebView.
       */
      if (!allowWebkitAcceleration) animation.playbackRate = 1.000001

      /**
       * If we can't animate the value natively then we can fallback to the numbers-only
       * polyfill for transforms.
       */
    } else if (valueIsTransform) {
      /**
       * If any keyframe is a string (because we measured it from the DOM), we need to convert
       * it into a number before passing to the Animation polyfill.
       */
      keyframes = keyframes.map((value) =>
        typeof value === "string" ? parseFloat(value) : value
      )

      /**
       * If we only have a single keyframe, we need to create an initial keyframe by reading
       * the current value from the DOM.
       */
      if (keyframes.length === 1) {
        keyframes.unshift(parseFloat(readInitialValue() as string))
      }

      const render = (latest: number) => {
        if (definition) latest = definition.toDefaultUnit(latest) as any
        style.set(element, name, latest)
      }

      animation = new Animation(render, keyframes as any, {
        ...options,
        duration,
        easing,
      })
    } else {
      const target = keyframes[keyframes.length - 1]
      style.set(
        element,
        name,
        definition && isNumber(target)
          ? definition.toDefaultUnit(target)
          : target
      )
    }

    if (isRecording) {
      record(
        element as HTMLElement,
        key,
        keyframes,
        {
          duration,
          delay: delay as number,
          easing,
          repeat,
          offset,
        },
        "motion-one"
      )
    }

    motionValue.setAnimation(animation)

    return animation
  }
}
