package expo.modules.setasideupload

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Status rules match mobile/src/upload/outbox.ts.
 * pending uploads, needs_auth waits for a new sign-in, failed stays for the user.
 */
object OutboxStore {
  private val lock = Any()
  private const val FILE_NAME = "setaside-outbox.json"

  private fun file(context: Context): File =
    File(context.applicationContext.filesDir, FILE_NAME)

  fun read(context: Context): String = synchronized(lock) {
    val stored = file(context)
    if (!stored.exists()) """{"items":[]}""" else stored.readText().ifBlank { """{"items":[]}""" }
  }

  private fun root(context: Context): JSONObject {
    return try {
      val parsed = JSONObject(read(context))
      if (!parsed.has("items")) parsed.put("items", JSONArray())
      parsed
    } catch (_: Exception) {
      JSONObject().put("items", JSONArray())
    }
  }

  private fun write(context: Context, json: JSONObject) {
    file(context).writeText(json.toString())
  }

  fun enqueue(context: Context, itemJson: String) = synchronized(lock) {
    val incoming = JSONObject(itemJson)
    val id = incoming.getString("id")
    incoming.put("status", "pending")
    if (!incoming.has("detail") || incoming.isNull("detail")) {
      incoming.put("detail", JSONObject.NULL)
    }
    val json = root(context)
    val items = json.getJSONArray("items")
    val next = JSONArray()
    next.put(incoming)
    for (index in 0 until items.length()) {
      val existing = items.getJSONObject(index)
      if (existing.optString("id") != id) next.put(existing)
    }
    json.put("items", next)
    write(context, json)
  }

  fun remove(context: Context, id: String) = synchronized(lock) {
    val json = root(context)
    val items = json.getJSONArray("items")
    val next = JSONArray()
    for (index in 0 until items.length()) {
      val existing = items.getJSONObject(index)
      if (existing.optString("id") != id) next.put(existing)
    }
    json.put("items", next)
    write(context, json)
  }

  fun nextPending(context: Context, userId: String): JSONObject? = synchronized(lock) {
    val items = root(context).getJSONArray("items")
    for (index in 0 until items.length()) {
      val item = items.getJSONObject(index)
      if (item.optString("status") == "pending" && item.optString("owner_id") == userId) {
        return JSONObject(item.toString())
      }
    }
    null
  }

  fun updateOne(context: Context, id: String, status: String, detail: String?) = synchronized(lock) {
    val json = root(context)
    val items = json.getJSONArray("items")
    for (index in 0 until items.length()) {
      val item = items.getJSONObject(index)
      if (item.optString("id") == id) {
        item.put("status", status)
        item.put("detail", detail ?: JSONObject.NULL)
      }
    }
    write(context, json)
  }

  fun markOwned(context: Context, userId: String, from: String, to: String, detail: String) =
    synchronized(lock) {
      val json = root(context)
      val items = json.getJSONArray("items")
      for (index in 0 until items.length()) {
        val item = items.getJSONObject(index)
        if (item.optString("owner_id") == userId && item.optString("status") == from) {
          item.put("status", to)
          item.put("detail", detail)
        }
      }
      write(context, json)
    }

  fun requeueNeedsAuth(context: Context, userId: String): Boolean = synchronized(lock) {
    val json = root(context)
    val items = json.getJSONArray("items")
    var changed = false
    for (index in 0 until items.length()) {
      val item = items.getJSONObject(index)
      if (item.optString("owner_id") == userId && item.optString("status") == "needs_auth") {
        item.put("status", "pending")
        item.put("detail", JSONObject.NULL)
        changed = true
      }
    }
    if (changed) write(context, json)
    changed
  }
}
