package expo.modules.setasideupload

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object SessionStore {
  private const val FILE = "setaside_upload_session"
  private const val TOKEN = "token"
  private const val USER = "user_id"
  private const val API = "api_base"

  private fun prefs(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()
    return EncryptedSharedPreferences.create(
      context,
      FILE,
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  fun write(context: Context, token: String, userId: String, apiBase: String) {
    prefs(context.applicationContext).edit()
      .putString(TOKEN, token)
      .putString(USER, userId)
      .putString(API, apiBase.trim().trimEnd('/'))
      .apply()
  }

  fun token(context: Context): String? =
    prefs(context.applicationContext).getString(TOKEN, null)?.ifBlank { null }

  fun userId(context: Context): String? =
    prefs(context.applicationContext).getString(USER, null)?.ifBlank { null }

  fun apiBase(context: Context): String? =
    prefs(context.applicationContext).getString(API, null)?.ifBlank { null }
}
