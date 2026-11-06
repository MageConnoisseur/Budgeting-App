package expo.modules.setasideupload

import java.util.concurrent.atomic.AtomicReference

data class LogLaunch(val url: String, val seq: Int)

/**
 * Widget taps publish here. The JS module reads the latest launch on startup
 * and listens for later taps while the activity is already open.
 */
object LaunchBus {
  private val latest = AtomicReference(LogLaunch("", 0))
  @Volatile var listener: ((LogLaunch) -> Unit)? = null

  fun publish(url: String) {
    val next = LogLaunch(url, latest.get().seq + 1)
    latest.set(next)
    listener?.invoke(next)
  }

  fun current(): LogLaunch = latest.get()
}
