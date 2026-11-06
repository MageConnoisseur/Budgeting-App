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
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyWidgetSources(androidRoot) {
  const javaDest = path.join(
    androidRoot,
    'app/src/main/java/com/setasideplan/app/widget',
  )
  for (const name of ['LogWidgetProvider.kt', 'WidgetOpenAnimator.kt']) {
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
  console.log('copied log widget sources into android/')
}
