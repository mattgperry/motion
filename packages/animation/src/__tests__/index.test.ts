import { Animation } from "../Animation"

function stopAnimation(animation?: any, needsCommit = true) {
  if (!animation || animation.playState === "finished") return

  // Suppress error thrown by WAAPI
  try {
    if (animation.stop) {
      animation.stop()
    } else {
      needsCommit && animation.commitStyles()
      animation.cancel()
    }
  } catch (e) {}
}

function mockReadTime(ms: number) {
  jest.spyOn(window.performance, "now").mockImplementation(() => ms)
}

function mockTimeFrom(seconds: number) {
  const ms = seconds * 1000
  let t = ms
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb: any) => {
    t += 50
    setTimeout(() => cb(t), 1)
    return 0
  })
  mockReadTime(ms)
}

beforeEach(() => {
  mockTimeFrom(0)
})

afterEach(() => {
  ;(window.requestAnimationFrame as any).mockRestore()
  ;(window.performance.now as any).mockRestore()
})

describe("animateNumber", () => {
  test("Animates numbers", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.1,
    })
    await animation.finished
    expect(output).toEqual([0.8022760787498554, 1])
  })

  test("Respects duration", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [-500, 500], {
      duration: 0.2,
    })
    await animation.finished
    expect(output).toEqual([
      -91.5383969972026, 302.2760787498554, 460.4030423986841, 500,
    ])
  })

  test("Respects delay", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.1,
    })
    await animation.finished
    expect(output).toEqual([
      0, 0, 0.4084616030027974, 0.8022760787498554, 0.9604030423986841,
      0.9999998390921971, 1,
    ])
  })

  test("Respects endDelay", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.1,
      endDelay: 0.2,
    })
    await animation.finished
    expect(output).toEqual([
      0, 0, 0.4084616030027974, 0.8022760787498554, 0.9604030423986841,
      0.9999998390921971, 1, 1, 1, 1,
    ])
  })

  test("Respects offset", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.1,
      offset: [0.5],
      easing: "linear",
    })
    await animation.finished
    expect(output).toEqual([
      0, 0, 0, 0, 0.4999999999999998, 0.9999999999999998, 1,
    ])
  })

  test("Respects ease as string", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      easing: "linear",
    })
    await animation.finished
    expect(output).toEqual([0.25, 0.5, 0.7499999999999999, 1])
  })

  test("Respects ease as string with multiple keyframes", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 0.5, 1], {
      duration: 0.2,
      easing: "ease-out",
    })
    await animation.finished
    expect(output).toEqual([
      0.3784135053574573, 0.6846233151445631, 0.9065962544700596, 1,
    ])
  })

  test("Respects ease as array with multiple keyframes", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 0.5, 1], {
      duration: 0.2,
      easing: ["ease-out"],
    })
    await animation.finished
    expect(output).toEqual([0.34231165757228155, 0.5, 0.8423116575722815, 1])
  })

  test("Respects repeat", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.2,
      repeat: 2,
      endDelay: 0.2,
    })
    await animation.finished
    expect(output).toEqual([
      0, 0, 0, 0, 0.4084616030027974, 0.8022760787498554, 0.9604030423986841, 1,
      0.4084616030027974, 0.8022760787498554, 0.9604030423986841,
      0.9999998390921971, 0.4084616030027974, 0.8022760787498554,
      0.9604030423986841, 1, 1, 1, 1, 1,
    ])
  })

  /**
   * TODO: Final values should potentially be 0s
   */
  test("Respects direction reverse", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.2,
      repeat: 1,
      endDelay: 0.2,
      direction: "reverse",
    })
    await animation.finished
    expect(output).toEqual([
      1, 1, 1, 1, 0.9604030423986841, 0.8022760787498554, 0.4084616030027974, 0,
      0.9604030423986841, 0.8022760787498554, 0.4084616030027974,
      0.00007338521390920506, 1, 1, 1, 1,
    ])
  })

  test("Respects direction alternate", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.2,
      repeat: 1,
      endDelay: 0.2,
      direction: "alternate",
    })
    await animation.finished
    expect(output).toEqual([
      0, 0, 0, 0, 0.4084616030027974, 0.8022760787498554, 0.9604030423986841, 1,
      0.9604030423986841, 0.8022760787498554, 0.4084616030027974,
      0.00007338521390920506, 1, 1, 1, 1,
    ])
  })

  test("Respects direction alternate-reverse", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      delay: 0.2,
      repeat: 1,
      endDelay: 0.2,
      direction: "alternate-reverse",
    })
    await animation.finished
    expect(output).toEqual([
      1, 1, 1, 1, 0.9604030423986841, 0.8022760787498554, 0.4084616030027974, 0,
      0.4084616030027974, 0.8022760787498554, 0.9604030423986841,
      0.9999998390921971, 1, 1, 1, 1,
    ])
  })

  test("Can set currentTime", async () => {
    mockTimeFrom(1)
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
    })
    // is in milliseconds
    animation.currentTime = 100
    await animation.finished
    expect(output).toEqual([0.9604030423986841, 1])
  })

  test("Can set rate", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.1,
    })
    animation.playbackRate = 0.5
    await animation.finished
    expect(output).toEqual([
      0.4084616030027974, 0.8022760787498554, 0.9604030423986841, 1,
    ])
  })

  test("Can manually finish", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.1,
    })
    animation.finish()
    await animation.finished
    expect(output).toEqual([1])
  })

  test("Can manually finish with delay", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.1,
      delay: 0.1,
      endDelay: 0.1,
    })
    animation.finish()
    await animation.finished
    expect(output).toEqual([1])
  })

  test("Can cancel", async () => {
    const output: number[] = []
    const animation = new Animation((v) => output.push(v), [0, 1], {
      duration: 0.1,
    })
    animation.cancel()

    return new Promise((resolve, reject) => {
      animation.finished
        .then(() => {
          expect(true).toBe(false)
          reject(undefined)
        })
        .catch(() => {
          expect(output).toEqual([0])
          resolve(undefined)
        })
    })
  })

  test("If autoplay is set to false, animation is paused", async () => {
    const output: number[] = []
    mockTimeFrom(1)
    new Animation((v) => output.push(v), [0, 1], {
      duration: 0.2,
      easing: "linear",
      repeat: 1,
      autoplay: false,
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 100)
    })
    expect(output).toEqual([])
  })

  test("Can be paused and played", async () => {
    const output: number[] = []
    mockTimeFrom(1)
    const animation = new Animation(
      (v) => {
        output.push(v)

        if (output.length === 6) {
          mockReadTime(1300)
          animation.pause()
        }

        if (output.length === 8) {
          mockTimeFrom(1.5)
          mockReadTime(1500)
          animation.play()
        }
      },
      [0, 1],
      {
        duration: 0.2,
        easing: "linear",
        repeat: 1,
      }
    )
    await animation.finished
    expect(output).toEqual([
      0.25, 0.5, 0.7499999999999999, 1, 0.25, 0.4999999999999998,
      0.4999999999999998, 0.4999999999999998, 0.7499999999999998, 1,
    ])
  })

  test("Can set currentTime while paused", async () => {
    const output: number[] = []
    let currentTime = 0
    const animation = new Animation(
      (v) => {
        output.push(v)

        if (output.length === 3) {
          mockReadTime(200)
          animation.pause()
        }

        if (output.length === 4) {
          currentTime = animation.currentTime
          animation.currentTime = 100
        }

        if (output.length === 6) {
          mockReadTime(400)
          animation.play()
        }
      },
      [0, 1],
      {
        duration: 0.4,
        easing: "linear",
      }
    )
    await animation.finished
    expect(output).toEqual([
      0.125, 0.25, 0.37499999999999994, 0.37499999999999994, 0.25, 0.25, 0.125,
      0.25, 0.37499999999999994, 0.5, 0.625, 0.7499999999999999,
      0.8749999999999999, 1,
    ])
    expect(currentTime).toBe(150)
  })

  test("stopAnimation is compatible", async () => {
    const output: number[] = []
    const animation = new Animation(
      (v) => {
        output.push(v)

        if (output.length === 4) {
          mockReadTime(200)
          stopAnimation(animation)
        }
      },
      [0, 1],
      {
        duration: 0.4,
        easing: "linear",
      }
    )
    try {
      await animation.finished
    } catch (e) {
      expect(output).toEqual([0.125, 0.25, 0.37499999999999994, 0.5])
    }
  })
})
