package expo.modules.setasideupload

import android.content.Context
import java.io.File

object CacheStore {
  private val allowed = setOf("categories", "funding")

  private fun file(context: Context, name: String): File {
    require(name in allowed) { "Unknown cache $name" }
    return File(context.applicationContext.filesDir, "setaside-cache-$name.json")
  }

  fun read(context: Context, name: String): String {
    val stored = file(context, name)
    return if (stored.exists()) stored.readText() else ""
  }

  fun write(context: Context, name: String, body: String) {
    file(context, name).writeText(body)
  }
}
