package expo.modules.setasideupload

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class UploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val token = SessionStore.token(applicationContext)
    val userId = SessionStore.userId(applicationContext)
    val base = SessionStore.apiBase(applicationContext)
    if (token.isNullOrBlank() || userId.isNullOrBlank()) {
      if (!userId.isNullOrBlank()) {
        OutboxStore.markOwned(
          applicationContext,
          userId,
          from = "pending",
          to = "needs_auth",
          detail = "Sign in to finish uploading",
        )
      }
      return Result.success()
    }
    if (base.isNullOrBlank()) return Result.retry()

    while (true) {
      val item = OutboxStore.nextPending(applicationContext, userId) ?: return Result.success()
      when (val outcome = post(base, token, item)) {
        PostOutcome.Ok -> OutboxStore.remove(applicationContext, item.getString("id"))
        PostOutcome.NeedsAuth -> {
          OutboxStore.markOwned(
            applicationContext,
            userId,
            from = "pending",
            to = "needs_auth",
            detail = "Sign in to finish uploading",
          )
          return Result.success()
        }
        is PostOutcome.Failed ->
          OutboxStore.updateOne(
            applicationContext,
            item.getString("id"),
            "failed",
            outcome.detail,
          )
        PostOutcome.Retry -> return Result.retry()
      }
    }
  }

  private fun post(base: String, token: String, item: JSONObject): PostOutcome {
    val body = JSONObject()
    body.put("category_id", item.getString("category_id"))
    body.put("amount", item.getString("amount"))
    body.put("date", item.getString("date"))
    if (item.isNull("note")) body.put("note", JSONObject.NULL) else body.put("note", item.optString("note"))
    val withdraw = item.optString("withdraw_from_category_id")
    if (!item.isNull("withdraw_from_category_id") && withdraw.isNotEmpty()) {
      body.put("withdraw_from_category_id", withdraw)
    }
    body.put("client_request_id", item.getString("id"))

    val connection = (URL("${base.trimEnd('/')}/api/transactions").openConnection() as HttpURLConnection)
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 120_000
      connection.readTimeout = 120_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.outputStream.use { stream ->
        stream.write(body.toString().toByteArray(Charsets.UTF_8))
      }
      val code = connection.responseCode
      val text = readBody(connection, code)
      when {
        code in 200..299 -> PostOutcome.Ok
        code == 401 -> PostOutcome.NeedsAuth
        code == 408 || code == 429 || code >= 500 -> PostOutcome.Retry
        else -> PostOutcome.Failed(detailOf(text, "Could not upload"))
      }
    } catch (_: Exception) {
      PostOutcome.Retry
    } finally {
      connection.disconnect()
    }
  }

  private fun readBody(connection: HttpURLConnection, code: Int): String {
    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
    return stream?.bufferedReader()?.use { it.readText().take(4000) } ?: ""
  }

  private fun detailOf(text: String, fallback: String): String {
    val detail = try {
      val json = JSONObject(text)
      when (val value = json.opt("detail")) {
        is String -> value
        is JSONArray -> value.optJSONObject(0)?.optString("msg").orEmpty()
        else -> ""
      }
    } catch (_: Exception) {
      ""
    }
    return (detail.ifBlank { fallback }).take(300)
  }
}

private sealed class PostOutcome {
  data object Ok : PostOutcome()
  data object NeedsAuth : PostOutcome()
  data object Retry : PostOutcome()
  data class Failed(val detail: String) : PostOutcome()
}
