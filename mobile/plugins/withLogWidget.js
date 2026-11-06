const fs = require('fs')
const path = require('path')
const {
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
  withStringsXml,
} = require('expo/config-plugins')

const TEMPLATE = path.join(__dirname, 'log-widget')

const STRINGS = {
  widget_label: 'Quick log',
  widget_description: 'Log income, an expense, or savings.',
  widget_income: 'Income',
  widget_expense: 'Expense',
  widget_savings: 'Savings',
  log_sheet_close: 'Close',
  log_sheet_category: 'Category',
  log_sheet_choose: 'Choose a category',
  log_sheet_amount: 'Amount',
  log_sheet_date: 'Date',
  log_sheet_prev_day: 'Previous day',
  log_sheet_next_day: 'Next day',
  log_sheet_today: 'Today',
  log_sheet_note: 'Note',
  log_sheet_note_hint: 'Optional',
  log_sheet_title_income: 'Log income',
  log_sheet_title_expense: 'Log an expense',
  log_sheet_title_savings: 'Log savings',
  log_sheet_save_income: 'Log income',
  log_sheet_save_expense: 'Log expense',
  log_sheet_save_savings: 'Log savings',
  log_sheet_saving: 'Saving…',
  log_sheet_need_category: 'Select a category.',
  log_sheet_need_amount: 'Enter an amount greater than zero.',
  log_sheet_need_sign_in:
    'Sign in from Setaside once, then logs from here upload in the background.',
  log_sheet_no_categories:
    'No %1$s categories on this phone yet. Open Setaside once while you are online.',
  log_sheet_withdraw: 'Also withdraw from %1$s',
  log_sheet_save_failed: 'Could not save that log.',
  log_sheet_untitled: 'Untitled',
}

const LOG_SHEET_STYLE = `  <style name="Theme.Setaside.LogSheet" parent="Theme.AppCompat.Light.NoActionBar">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowIsFloating">false</item>
    <item name="android:backgroundDimEnabled">false</item>
    <item name="android:windowAnimationStyle">@null</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">#f3f6f2</item>
    <item name="android:windowDrawsSystemBarBackgrounds">true</item>
    <item name="android:windowLightStatusBar">false</item>
    <item name="android:windowLightNavigationBar">true</item>
    <item name="colorPrimary">@color/colorPrimary</item>
    <item name="android:windowSplashScreenBackground">@android:color/transparent</item>
    <item name="android:windowSplashScreenAnimatedIcon">@drawable/log_sheet_transparent</item>
    <item name="android:windowSplashScreenAnimationDuration">0</item>
  </style>
`

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyWidgetSources(androidRoot) {
  const javaDest = path.join(
    androidRoot,
    'app/src/main/java/com/setasideplan/app/widget',
  )
  for (const name of [
    'LogWidgetProvider.kt',
    'WidgetOpenAnimator.kt',
    'LogSheetActivity.kt',
  ]) {
    copyFile(path.join(TEMPLATE, 'java/widget', name), path.join(javaDest, name))
  }
  const resSrc = path.join(TEMPLATE, 'res')
  const resDest = path.join(androidRoot, 'app/src/main/res')
  for (const rel of walk(resSrc)) {
    copyFile(path.join(resSrc, rel), path.join(resDest, rel))
  }
}

function walk(dir, prefix = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

function ensureString(strings, name, value) {
  const resources = strings.resources ?? (strings.resources = {})
  const list = resources.string ?? (resources.string = [])
  if (!list.some((item) => item.$?.name === name)) {
    list.push({ $: { name }, _: value })
  }
}

function ensureLogSheetStyle(androidRoot) {
  const file = path.join(androidRoot, 'app/src/main/res/values/styles.xml')
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  if (text.includes('Theme.Setaside.LogSheet')) return
  const next = text.replace('</resources>', `${LOG_SHEET_STYLE}</resources>\n`)
  fs.writeFileSync(file, next)
}

function ensureLogSheetActivity(manifest) {
  const app = manifest.manifest.application?.[0]
  if (!app) return
  const activities = app.activity ?? (app.activity = [])
  const name = '.widget.LogSheetActivity'
  if (activities.some((item) => item.$?.['android:name'] === name)) return
  activities.push({
    $: {
      'android:name': name,
      'android:exported': 'true',
      'android:excludeFromRecents': 'true',
      'android:launchMode': 'singleTop',
      'android:taskAffinity': '',
      'android:theme': '@style/Theme.Setaside.LogSheet',
      'android:windowSoftInputMode': 'adjustResize|stateHidden',
      'android:screenOrientation': 'portrait',
      'android:configChanges':
        'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize',
    },
  })
}

function ensureReceiver(manifest) {
  const app = manifest.manifest.application?.[0]
  if (!app) return
  const receivers = app.receiver ?? (app.receiver = [])
  const name = '.widget.LogWidgetProvider'
  if (receivers.some((item) => item.$?.['android:name'] === name)) return
  receivers.push({
    $: {
      'android:name': name,
      'android:exported': 'true',
      'android:label': '@string/widget_label',
    },
    'intent-filter': [
      {
        action: [
          { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
        ],
      },
    ],
    'meta-data': [
      {
        $: {
          'android:name': 'android.appwidget.provider',
          'android:resource': '@xml/log_widget_info',
        },
      },
    ],
  })
}

function ensureMainActivity(contents) {
  if (contents.includes('setaside-widget-open')) return contents
  let next = contents
  if (!next.includes('import com.setasideplan.app.widget.WidgetOpenAnimator')) {
    next = next.replace(
      'import expo.modules.ReactActivityDelegateWrapper\n',
      'import expo.modules.ReactActivityDelegateWrapper\nimport android.content.Intent\nimport com.setasideplan.app.widget.WidgetOpenAnimator\n',
    )
  }
  next = next.replace(
    'super.onCreate(null)\n  }',
    'super.onCreate(null)\n    WidgetOpenAnimator.play(this, intent) // setaside-widget-open\n  }',
  )
  if (!next.includes('override fun onNewIntent')) {
    next = next.replace(
      'override fun getMainComponentName',
      `override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
    WidgetOpenAnimator.play(this, intent) // setaside-widget-open
  }

  override fun getMainComponentName`,
    )
  }
  return next
}

function withLogWidget(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      copyWidgetSources(mod.modRequest.platformProjectRoot)
      ensureLogSheetStyle(mod.modRequest.platformProjectRoot)
      return mod
    },
  ])

  config = withStringsXml(config, (mod) => {
    for (const [name, value] of Object.entries(STRINGS)) {
      ensureString(mod.modResults, name, value)
    }
    return mod
  })

  config = withAndroidManifest(config, (mod) => {
    ensureReceiver(mod.modResults)
    ensureLogSheetActivity(mod.modResults)
    return mod
  })

  config = withMainActivity(config, (mod) => {
    mod.modResults.contents = ensureMainActivity(mod.modResults.contents)
    return mod
  })

  return config
}

module.exports = withLogWidget

if (require.main === module) {
  const androidRoot = path.join(__dirname, '..', 'android')
  copyWidgetSources(androidRoot)
  ensureLogSheetStyle(androidRoot)
  console.log('copied log widget sources into android/')
}
