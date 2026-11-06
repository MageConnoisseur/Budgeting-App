package com.setasideplan.app.widget

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.transition.AutoTransition
import android.transition.TransitionManager
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.setasideplan.app.R
import expo.modules.setasideupload.CacheStore
import expo.modules.setasideupload.OutboxStore
import expo.modules.setasideupload.SessionStore
import expo.modules.setasideupload.UploadScheduler
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.concurrent.thread

/**
 * Partial window for a widget tap. The home screen stays visible around the
 * log form. Save stores the row on the phone and shrinks the window back to
 * the widget while the upload continues in the background.
 */
class LogSheetActivity : AppCompatActivity() {
  private lateinit var scrim: View
  private lateinit var stage: View
  private lateinit var card: LinearLayout
  private lateinit var titleView: TextView
  private lateinit var errorView: TextView
  private lateinit var categoryValue: TextView
  private lateinit var categoryChevron: TextView
  private lateinit var categoryScroll: View
  private lateinit var categoryItems: LinearLayout
  private lateinit var details: View
  private lateinit var amountField: EditText
  private lateinit var dateText: TextView
  private lateinit var todayButton: TextView
  private lateinit var todayTag: TextView
  private lateinit var noteField: EditText
  private lateinit var withdrawBox: CheckBox
  private lateinit var saveButton: TextView

  private var kind: String = "expense"
  private var selectedId: String? = null
  private var fundingId: String? = null
  private var categories: List<SheetCategory> = emptyList()
  private var selectedDate: Calendar = noonToday()
  private var closing = false
  private var saving = false
  private var categoriesOpen = true
  private var lastIme = 0
  private var lastStatusTop = 0
  private var lastNavBottom = 0

  private val dayFormat = SimpleDateFormat("EEE, MMM d", Locale.US)
  private val isoFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val opened = WidgetOpenAnimator.kindOf(intent)
    if (opened == null) {
      finish()
      return
    }
    kind = opened
    setContentView(R.layout.log_sheet)
    scrim = findViewById(R.id.log_sheet_scrim)
    stage = findViewById(R.id.log_sheet_stage)
    card = findViewById(R.id.log_sheet_card)
    titleView = findViewById(R.id.log_sheet_title)
    errorView = findViewById(R.id.log_sheet_error)
    categoryValue = findViewById(R.id.log_sheet_category_value)
    categoryChevron = findViewById(R.id.log_sheet_category_chevron)
    categoryScroll = findViewById(R.id.log_sheet_categories)
    categoryItems = findViewById(R.id.log_sheet_category_items)
    details = findViewById(R.id.log_sheet_details)
    amountField = findViewById(R.id.log_sheet_amount)
    dateText = findViewById(R.id.log_sheet_date)
    todayButton = findViewById(R.id.log_sheet_today)
    todayTag = findViewById(R.id.log_sheet_today_tag)
    noteField = findViewById(R.id.log_sheet_note)
    withdrawBox = findViewById(R.id.log_sheet_withdraw)
    saveButton = findViewById(R.id.log_sheet_save)

    WindowCompat.setDecorFitsSystemWindows(window, false)
    @Suppress("DEPRECATION")
    window.setSoftInputMode(
      WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN,
    )
    card.clipToOutline = true
    card.outlineProvider = ViewOutlineProvider.BACKGROUND
    ViewCompat.setOnApplyWindowInsetsListener(card) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      lastIme = ime.bottom
      lastStatusTop = bars.top
      lastNavBottom = bars.bottom
      applyChrome(animate = false)
      insets
    }
    ViewCompat.requestApplyInsets(card)

    scrim.setOnClickListener { shrinkAndFinish() }
    findViewById<View>(R.id.log_sheet_category_field).setOnClickListener {
      if (categoriesOpen && selectedId == null) return@setOnClickListener
      setPicking(!categoriesOpen, animate = true)
    }
    amountField.imeOptions = EditorInfo.IME_ACTION_NEXT
    amountField.setOnEditorActionListener { _, actionId, _ ->
      if (actionId == EditorInfo.IME_ACTION_NEXT) {
        noteField.requestFocus()
        true
      } else {
        false
      }
    }
    findViewById<View>(R.id.log_sheet_prev_day).setOnClickListener { shiftDate(-1) }
    findViewById<View>(R.id.log_sheet_next_day).setOnClickListener { shiftDate(1) }
    todayButton.setOnClickListener {
      selectedDate = noonToday()
      refreshDate()
      refreshFunding()
    }
    saveButton.setOnClickListener { onSave() }
    noteField.setOnEditorActionListener { _, actionId, _ ->
      if (actionId == EditorInfo.IME_ACTION_DONE) {
        onSave()
        true
      } else {
        false
      }
    }
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          shrinkAndFinish()
        }
      },
    )

    bind()
    WidgetOpenAnimator.play(this, intent, notifyJs = false, target = stage)
    scrim.alpha = 0f
    scrim.animate().alpha(1f).setDuration(300).start()
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    if (closing) return
    val next = WidgetOpenAnimator.kindOf(intent) ?: return
    setIntent(intent)
    if (next != kind) {
      kind = next
      selectedId = null
      categoriesOpen = true
      amountField.setText("")
      noteField.setText("")
      selectedDate = noonToday()
      bind()
    }
    WidgetOpenAnimator.play(this, intent, notifyJs = false, target = stage)
    scrim.animate().cancel()
    scrim.alpha = 0f
    scrim.animate().alpha(1f).setDuration(300).start()
  }

  private fun bind() {
    titleView.setText(titleRes())
    saveButton.setText(saveRes())
    clearError()
    categories = readCategories()
    if (selectedId != null && categories.none { it.id == selectedId }) selectedId = null
    refreshCategoryLabel()
    renderCategories()
    refreshDate()
    refreshFunding()
    refreshGate()
    categoriesOpen = selectedId == null
    applyChrome(animate = false)
  }

  private fun renderCategories() {
    categoryItems.removeAllViews()
    if (categories.isEmpty()) {
      val empty = TextView(this)
      empty.setTextColor(Color.parseColor("#5f7368"))
      empty.textSize = 15f
      empty.setPadding(dp(14), dp(14), dp(14), dp(14))
      empty.text = getString(R.string.log_sheet_no_categories, kindNoun())
      categoryItems.addView(empty)
      return
    }
    for (category in categories) {
      val row = TextView(this)
      row.text = category.name
      row.textSize = 18f
      row.setTextColor(Color.parseColor("#14231c"))
      row.gravity = Gravity.CENTER_VERTICAL
      row.minHeight = dp(56)
      row.setPadding(dp(16), dp(8), dp(16), dp(8))
      val selected = category.id == selectedId
      row.setBackgroundColor(if (selected) Color.parseColor("#e4f0e9") else Color.TRANSPARENT)
      row.setOnClickListener { choose(category) }
      categoryItems.addView(
        row,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ),
      )
    }
  }

  private fun choose(category: SheetCategory) {
    selectedId = category.id
    refreshCategoryLabel()
    renderCategories()
    refreshFunding()
    clearError()
    setPicking(open = false, animate = true)
    details.postDelayed({
      if (closing || categoriesOpen || isDestroyed) return@postDelayed
      amountField.requestFocus()
      val imm = getSystemService(InputMethodManager::class.java)
      imm?.showSoftInput(amountField, InputMethodManager.SHOW_IMPLICIT)
    }, 220)
  }

  private fun refreshCategoryLabel() {
    val selected = categories.find { it.id == selectedId }
    if (selected == null) {
      categoryValue.setText(R.string.log_sheet_choose)
      categoryValue.setTextColor(Color.parseColor("#5f7368"))
    } else {
      categoryValue.text = selected.name
      categoryValue.setTextColor(Color.parseColor("#14231c"))
    }
  }

  private fun refreshDate() {
    dateText.text = dayFormat.format(selectedDate.time)
    val today = isToday(selectedDate)
    todayButton.visibility = if (today) View.GONE else View.VISIBLE
    todayTag.visibility = if (today) View.VISIBLE else View.GONE
  }

  private fun refreshFunding() {
    fundingId = null
    if (kind != "expense" || selectedId == null) {
      withdrawBox.visibility = View.GONE
      withdrawBox.isChecked = false
      return
    }
    val choice = fundingChoice(selectedDate, selectedId!!)
    if (choice == null) {
      withdrawBox.visibility = View.GONE
      withdrawBox.isChecked = false
      return
    }
    fundingId = choice.first
    withdrawBox.visibility = View.VISIBLE
    withdrawBox.isChecked = true
    withdrawBox.text = getString(R.string.log_sheet_withdraw, choice.second)
  }

  private fun refreshGate() {
    val ready = !saving && userIdOrNull() != null && categories.isNotEmpty()
    saveButton.isEnabled = ready
    saveButton.alpha = if (ready) 1f else 0.5f
    if (userIdOrNull() == null) {
      showError(getString(R.string.log_sheet_need_sign_in))
    }
  }

  private fun onSave() {
    if (closing || saving) return
    val category = categories.find { it.id == selectedId }
    if (category == null) {
      showError(getString(R.string.log_sheet_need_category))
      setPicking(open = true, animate = true)
      return
    }
    val amount = moneyOrNull(amountField.text?.toString().orEmpty())
    if (amount == null) {
      showError(getString(R.string.log_sheet_need_amount))
      amountField.requestFocus()
      return
    }
    val userId = userIdOrNull()
    if (userId == null) {
      showError(getString(R.string.log_sheet_need_sign_in))
      return
    }
    val noteText = noteField.text?.toString()?.trim().orEmpty()
    val withdraw = if (withdrawBox.visibility == View.VISIBLE && withdrawBox.isChecked) {
      fundingId
    } else {
      null
    }
    val item = JSONObject()
    item.put("id", UUID.randomUUID().toString())
    item.put("owner_id", userId)
    item.put("kind", kind)
    item.put("category_id", category.id)
    item.put("category_name", category.name)
    item.put("amount", amount)
    item.put("date", isoFormat.format(selectedDate.time))
    item.put("note", if (noteText.isEmpty()) JSONObject.NULL else noteText)
    item.put("withdraw_from_category_id", withdraw ?: JSONObject.NULL)
    item.put("status", "pending")
    item.put("detail", JSONObject.NULL)
    item.put("created_at", isoNow())

    saving = true
    saveButton.isEnabled = false
    saveButton.alpha = 0.5f
    saveButton.setText(R.string.log_sheet_saving)
    clearError()
    thread(name = "setaside-log-sheet") {
      try {
        OutboxStore.enqueue(applicationContext, item.toString())
        UploadScheduler.schedule(applicationContext)
        runOnUiThread {
          if (!isDestroyed) shrinkAndFinish()
        }
      } catch (_: Exception) {
        runOnUiThread {
          if (isDestroyed) return@runOnUiThread
          saving = false
          saveButton.setText(saveRes())
          refreshGate()
          showError(getString(R.string.log_sheet_save_failed))
        }
      }
    }
  }

  private fun shrinkAndFinish() {
    if (closing || isDestroyed) return
    closing = true
    currentFocus?.let { focused ->
      val imm = getSystemService(InputMethodManager::class.java)
      imm?.hideSoftInputFromWindow(focused.windowToken, 0)
    }
    scrim.animate().cancel()
    scrim.animate().alpha(0f).setDuration(300).start()
    WidgetOpenAnimator.playClose(stage, intent) {
      if (isDestroyed) return@playClose
      if (Build.VERSION.SDK_INT >= 34) {
        overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
      }
      finish()
      if (Build.VERSION.SDK_INT < 34) {
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
      }
    }
  }

  private fun shiftDate(days: Int) {
    selectedDate.add(Calendar.DAY_OF_MONTH, days)
    refreshDate()
    refreshFunding()
  }

  private fun setPicking(open: Boolean, animate: Boolean) {
    categoriesOpen = open
    applyChrome(animate)
  }

  private fun applyChrome(animate: Boolean) {
    if (animate) {
      val transition = AutoTransition()
      transition.duration = 220
      TransitionManager.beginDelayedTransition(stage as ViewGroup, transition)
    }
    val screen = resources.displayMetrics.heightPixels
    val params = card.layoutParams as FrameLayout.LayoutParams
    params.gravity = Gravity.BOTTOM
    val picking = categoriesOpen && lastIme == 0
    if (lastIme > 0) {
      // Sit in the band above the keyboard, not in the keyboard's own rect.
      params.height = (screen - lastIme).coerceAtLeast(dp(280))
      params.bottomMargin = lastIme
      card.setPadding(dp(16), lastStatusTop + dp(12), dp(16), dp(16))
      categoryScroll.visibility = View.GONE
      details.visibility = View.VISIBLE
    } else if (picking) {
      params.height = (screen * 0.9f).toInt()
      params.bottomMargin = 0
      card.setPadding(dp(16), dp(12), dp(16), lastNavBottom + dp(16))
      categoryScroll.visibility = View.VISIBLE
      details.visibility = View.GONE
    } else {
      params.height = FrameLayout.LayoutParams.WRAP_CONTENT
      params.bottomMargin = 0
      card.setPadding(dp(16), dp(12), dp(16), lastNavBottom + dp(16))
      categoryScroll.visibility = View.GONE
      details.visibility = View.VISIBLE
    }
    card.layoutParams = params
    categoryChevron.text = if (picking) "▴" else "▾"
  }

  private fun readCategories(): List<SheetCategory> {
    val raw = try {
      CacheStore.read(this, "categories")
    } catch (_: Exception) {
      return emptyList()
    }
    if (raw.isBlank()) return emptyList()
    return try {
      val array = JSONArray(raw)
      val out = ArrayList<SheetCategory>(array.length())
      for (index in 0 until array.length()) {
        val obj = array.optJSONObject(index) ?: continue
        if (obj.optString("kind") != kind) continue
        if (obj.optBoolean("archived", false)) continue
        val id = obj.optString("id")
        if (id.isBlank()) continue
        val name = obj.optString("name").ifBlank { getString(R.string.log_sheet_untitled) }
        out.add(SheetCategory(id, name, obj.optInt("sort_order", 0)))
      }
      out.sortedWith(compareBy({ it.sort }, { it.name.lowercase(Locale.US) }))
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun fundingChoice(date: Calendar, categoryId: String): Pair<String, String>? {
    val raw = try {
      CacheStore.read(this, "funding")
    } catch (_: Exception) {
      return null
    }
    if (raw.isBlank()) return null
    return try {
      val map = JSONObject(raw)
      val key = "${date.get(Calendar.YEAR)}-${date.get(Calendar.MONTH) + 1}-$categoryId"
      if (!map.has(key) || map.isNull(key)) return null
      val obj = map.optJSONObject(key) ?: return null
      val id = obj.optString("id")
      val name = obj.optString("name")
      if (id.isBlank() || name.isBlank()) null else id to name
    } catch (_: Exception) {
      null
    }
  }

  private fun userIdOrNull(): String? = try {
    SessionStore.userId(this)?.ifBlank { null }
  } catch (_: Exception) {
    null
  }

  private fun showError(message: String) {
    errorView.text = message
    errorView.visibility = View.VISIBLE
  }

  private fun clearError() {
    errorView.text = ""
    errorView.visibility = View.GONE
  }

  private fun titleRes(): Int = when (kind) {
    "income" -> R.string.log_sheet_title_income
    "savings" -> R.string.log_sheet_title_savings
    else -> R.string.log_sheet_title_expense
  }

  private fun saveRes(): Int = when (kind) {
    "income" -> R.string.log_sheet_save_income
    "savings" -> R.string.log_sheet_save_savings
    else -> R.string.log_sheet_save_expense
  }

  private fun kindNoun(): String = when (kind) {
    "income" -> "income"
    "savings" -> "savings"
    else -> "expense"
  }

  private fun isToday(cal: Calendar): Boolean {
    val now = Calendar.getInstance()
    return cal.get(Calendar.YEAR) == now.get(Calendar.YEAR) &&
      cal.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
  }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density).toInt()

  private fun moneyOrNull(raw: String): String? {
    val cleaned = raw.trim().replace(Regex("[^0-9.]"), "")
    if (cleaned.isEmpty() || cleaned.count { it == '.' } > 1) return null
    val value = cleaned.toBigDecimalOrNull() ?: return null
    val scaled = value.setScale(2, RoundingMode.HALF_UP)
    if (scaled <= BigDecimal.ZERO) return null
    return scaled.toPlainString()
  }

  private fun noonToday(): Calendar = Calendar.getInstance().apply {
    set(Calendar.HOUR_OF_DAY, 12)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }

  private fun isoNow(): String {
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date())
  }

  private data class SheetCategory(val id: String, val name: String, val sort: Int)
}
