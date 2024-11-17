import type {
  AnimationControls,
  AnimationOptions,
  EasingFunction,
} from "@motionone/types"
import {
  isEasingGenerator,
  isEasingList,
  defaults,
  noopReturn,
  interpolate as createInterpolate,
} from "@motionone/utils"
import { getEasingFunction } from "./utils/easing"

export class Animation implements Omit<AnimationControls, "stop" | "duration"> {
  private resolve?: (value: any) => void

  private reject?: (value: any) => void

  startTime: number | null = null

  private pauseTime: number | undefined

  private rate = 1

  private tick: (t: number) => void

  private t = 0

  private cancelTimestamp: number | null = null

  private frameRequestId?: number

  private easing: EasingFunction = noopReturn

  private duration: number = 0

  private totalDuration: number = 0

  private repeat: number = 0

  playState: AnimationPlayState = "idle"

  constructor(
    output: (v: number) => void,
    keyframes: number[] = [0, 1],
    {
      easing,
      duration: initialDuration = defaults.duration,
      delay = defaults.delay,
      endDelay = defaults.endDelay,
      repeat = defaults.repeat,
      offset,
      direction = "normal",
      autoplay = true,
    }: AnimationOptions = {}
  ) {
    easing = easing || defaults.easing

    if (isEasingGenerator(easing)) {
      const custom = easing.createAnimation(keyframes)
      easing = custom.easing
      keyframes = (custom.keyframes as number[]) || keyframes
      initialDuration = custom.duration || initialDuration
    }

    this.repeat = repeat

    this.easing = isEasingList(easing) ? noopReturn : getEasingFunction(easing)
    this.updateDuration(initialDuration)

    const interpolate = createInterpolate(
      keyframes,
      offset,
      isEasingList(easing) ? easing.map(getEasingFunction) : noopReturn
    )

    this.tick = (timestamp: number) => {
      this.frameRequestId = undefined

      // TODO: Temporary fix for OptionsResolver typing
      delay = delay as number

      let t = 0
      if (this.pauseTime !== undefined) {
        t = this.pauseTime
      } else {
        t = (timestamp - this.startTime!) * this.rate
      }

      this.t = t

      // Convert to seconds
      t /= 1000

      // Rebase on delay
      t = Math.max(t - delay, 0)

      /**
       * If this animation has finished, set the current time
       * to the total duration.
       */
      if (this.playState === "finished" && this.pauseTime === undefined) {
        t = this.totalDuration
      }

      /**
       * Get the current progress (0-1) of the animation. If t is >
       * than duration we'll get values like 2.5 (midway through the
       * third iteration)
       */
      const progress = t / this.duration

      // TODO progress += iterationStart

      /**
       * Get the current iteration (0 indexed). For instance the floor of
       * 2.5 is 2.
       */
      let currentIteration = Math.floor(progress)

      /**
       * Get the current progress of the iteration by taking the remainder
       * so 2.5 is 0.5 through iteration 2
       */
      let iterationProgress = progress % 1.0

      if (!iterationProgress && progress >= 1) {
        iterationProgress = 1
      }

      /**
       * If iteration progress is 1 we count that as the end
       * of the previous iteration.
       */
      iterationProgress === 1 && currentIteration--

      /**
       * Reverse progress if we're not running in "normal" direction
       */
      const iterationIsOdd = currentIteration % 2
      if (
        direction === "reverse" ||
        (direction === "alternate" && iterationIsOdd) ||
        (direction === "alternate-reverse" && !iterationIsOdd)
      ) {
        iterationProgress = 1 - iterationProgress
      }

      const p = t >= this.totalDuration ? 1 : Math.min(iterationProgress, 1)
      const latest = interpolate(this.easing(p))
      output(latest)

      const isAnimationFinished =
        this.pauseTime === undefined &&
        (this.playState === "finished" || t >= this.totalDuration + endDelay)

      if (isAnimationFinished) {
        this.playState = "finished"
        this.resolve?.(latest)
      } else if (this.playState !== "idle") {
        this.requestAnimationFrame()
      }
    }

    if (autoplay) this.play()
  }

  finished = new Promise((resolve, reject) => {
    this.resolve = resolve
    this.reject = reject
  })

  play() {
    const now = performance.now()
    this.playState = "running"

    if (this.pauseTime !== undefined) {
      this.startTime = now - this.pauseTime
    } else if (!this.startTime) {
      this.startTime = now
    }

    this.cancelTimestamp = this.startTime
    this.pauseTime = undefined
    this.requestAnimationFrame()
  }

  pause() {
    this.playState = "paused"
    this.pauseTime = this.t
  }

  finish() {
    this.playState = "finished"
    this.tick(0)
  }

  stop() {
    this.playState = "idle"

    this.cancelAnimationFrame()

    this.reject?.(false)
  }

  cancel() {
    this.stop()
    this.tick(this.cancelTimestamp!)
  }

  reverse() {
    this.rate *= -1
  }

  commitStyles() {}

  private updateDuration(duration: number) {
    this.duration = duration
    this.totalDuration = duration * (this.repeat + 1)
  }

  get currentTime() {
    return this.t
  }

  set currentTime(t: number) {
    if (this.pauseTime !== undefined || this.rate === 0) {
      this.pauseTime = t
    } else {
      this.startTime = performance.now() - t / this.rate
    }
  }

  get playbackRate() {
    return this.rate
  }

  set playbackRate(rate) {
    this.rate = rate
  }

  private requestAnimationFrame() {
    if (this.frameRequestId === undefined) {
      this.frameRequestId = requestAnimationFrame(this.tick)
    }
  }

  private cancelAnimationFrame() {
    if (this.frameRequestId !== undefined) {
      cancelAnimationFrame(this.frameRequestId)
      this.frameRequestId = undefined
    }
  }
}
