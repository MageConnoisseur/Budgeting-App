package expo.modules.setasideupload

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SetasideUploadModule : Module() {
  private val reactContext: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SetasideUpload")
    Events("onLogLaunch")

    OnCreate {
      LaunchBus.listener = { launch ->
        sendEvent(
          "onLogLaunch",
          mapOf("url" to launch.url, "seq" to launch.seq),
        )
      }
    }

    OnDestroy {
      LaunchBus.listener = null
    }

    Function("getPendingLaunch") {
      val launch = LaunchBus.current()
      mapOf("url" to launch.url, "seq" to launch.seq)
    }

    AsyncFunction("setSession") { token: String, userId: String, apiBase: String ->
      SessionStore.write(reactContext, token, userId, apiBase)
    }

    AsyncFunction("enqueue") { itemJson: String ->
      val context = reactContext
      OutboxStore.enqueue(context, itemJson)
      UploadScheduler.schedule(context)
      OutboxStore.read(context)
    }

    AsyncFunction("listOutbox") {
      OutboxStore.read(reactContext)
    }

    AsyncFunction("remove") { id: String ->
      val context = reactContext
      OutboxStore.remove(context, id)
      OutboxStore.read(context)
    }

    AsyncFunction("retryNeedsAuth") { userId: String ->
      val context = reactContext
      OutboxStore.requeueNeedsAuth(context, userId)
      UploadScheduler.schedule(context)
      OutboxStore.read(context)
    }

    AsyncFunction("readCache") { name: String ->
      CacheStore.read(reactContext, name)
    }

    AsyncFunction("writeCache") { name: String, body: String ->
      CacheStore.write(reactContext, name, body)
    }
  }
}
