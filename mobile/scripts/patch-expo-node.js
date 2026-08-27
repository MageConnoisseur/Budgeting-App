#!/usr/bin/env node
/**
 * Expo's Gradle plugins hardcode commandLine("node"). Android Studio's
 * Gradle daemon has no Node on PATH (nvm). Patch Expo Kotlin sources so
 * they resolve an absolute Node binary (or our android/bin/node wrapper).
 *
 * Idempotent. Run via postinstall / setup-android-studio.sh.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const EXPO_PLUGIN = path.join(
  ROOT,
  'node_modules/expo-modules-autolinking/android/expo-gradle-plugin',
)
const SHARED = path.join(
  EXPO_PLUGIN,
  'expo-autolinking-plugin-shared/src/main/kotlin/expo/modules/plugin',
)
const SETTINGS = path.join(
  EXPO_PLUGIN,
  'expo-autolinking-settings-plugin/src/main/kotlin/expo/modules/plugin',
)
const PLUGIN = path.join(
  EXPO_PLUGIN,
  'expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin',
)
const MARKER = 'SETASIDE_NODE_RESOLVER'

const RESOLVER_KT = `package expo.modules.plugin

import java.io.File

/** Setaside: resolve an absolute Node binary without relying on PATH. */
object NodeResolver {
  @JvmStatic
  fun resolve(): String {
    System.getenv("NODE_BINARY")?.trim()?.takeIf { it.isNotEmpty() && File(it).canExecute() }?.let {
      return it
    }

    var dir: File? = File(System.getProperty("user.dir") ?: ".")
    repeat(10) {
      val current = dir ?: return@repeat
      readNodeBinaryProp(File(current, "local.properties"))?.let { return it }
      readNodeBinaryProp(File(current, "android/local.properties"))?.let { return it }
      for (rel in listOf("bin/node", "android/bin/node")) {
        val candidate = File(current, rel)
        if (candidate.exists()) return candidate.absolutePath
      }
      dir = current.parentFile
    }

    val home = System.getProperty("user.home") ?: ""
    val nvmRoot = File(home + "/.nvm/versions/node")
    if (nvmRoot.isDirectory) {
      nvmRoot.listFiles()
        ?.filter { it.isDirectory }
        ?.sortedByDescending { it.name }
        ?.forEach { ver ->
          val n = File(ver, "bin/node")
          if (n.canExecute()) return n.absolutePath
        }
    }

    for (c in listOf(
      "/usr/local/bin/node",
      "/usr/bin/node",
      "/opt/homebrew/bin/node",
      home + "/.volta/bin/node",
      home + "/.asdf/shims/node",
      home + "/.local/share/fnm/aliases/default/bin/node",
      home + "/.fnm/aliases/default/bin/node",
      home + "/.local/bin/node",
    )) {
      if (File(c).canExecute()) return c
    }

    return "node"
  }

  private fun readNodeBinaryProp(file: File): String? {
    if (!file.isFile) return null
    file.readLines().forEach { line ->
      val trimmed = line.trim()
      if (trimmed.startsWith("node.binary=")) {
        val p = trimmed.substringAfter("=").trim()
        if (File(p).canExecute()) return p
      }
    }
    return null
  }

  /** Build an argv that starts with Node (bash + wrapper when needed). */
  @JvmStatic
  fun commandLine(vararg args: String): List<String> {
    val node = resolve()
    val file = File(node)
    val isWrapper =
      file.isFile &&
        file.length() < 100_000L &&
        runCatching { file.readText().contains("resolve_node") }.getOrDefault(false)
    return if (isWrapper) {
      listOf("/bin/bash", node) + args.toList()
    } else {
      listOf(node) + args.toList()
    }
  }
}
`

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function main() {
  if (!fs.existsSync(EXPO_PLUGIN)) {
    console.log('expo-modules-autolinking not installed; skip patch')
    return
  }

  writeFile(path.join(SHARED, 'NodeResolver.kt'), RESOLVER_KT)
  console.log('wrote NodeResolver.kt')

  const builderPath = path.join(SHARED, 'AutolinkingCommandBuilder.kt')
  let builder = fs.readFileSync(builderPath, 'utf8')
  if (!builder.includes(MARKER)) {
    const replaced = builder.replace(
      /private val baseCommand = listOf\(\s*"node",\s*"--no-warnings",\s*"--eval",\s*"require\('expo\/bin\/autolinking'\)",\s*"expo-modules-autolinking"\s*\)/,
      `private val baseCommand = NodeResolver.commandLine(
    // ${MARKER}
    "--no-warnings",
    "--eval",
    "require('expo/bin/autolinking')",
    "expo-modules-autolinking"
  )`,
    )
    if (!replaced.includes(MARKER)) {
      throw new Error('Failed to patch AutolinkingCommandBuilder.kt')
    }
    writeFile(builderPath, replaced)
    console.log('patched AutolinkingCommandBuilder.kt')
  } else {
    console.log('AutolinkingCommandBuilder.kt already patched')
  }

  for (const name of [
    'ExpoAutolinkingSettingsPlugin.kt',
    'ExpoAutolinkingSettingsExtension.kt',
  ]) {
    const filePath = path.join(SETTINGS, name)
    const src = fs.readFileSync(filePath, 'utf8')
    if (src.includes(MARKER)) {
      console.log(`${name} already patched`)
      continue
    }
    const out = src.replace(
      /env\.commandLine\(\s*"node",\s*((?:"(?:\\.|[^"\\])*"|[^)])*)\)/g,
      `env.commandLine(*NodeResolver.commandLine(/* ${MARKER} */ $1).toTypedArray())`,
    )
    if (out === src) {
      throw new Error(`Failed to patch ${name}`)
    }
    writeFile(filePath, out)
    console.log(`patched ${name}`)
  }

  const pluginPath = path.join(PLUGIN, 'ExpoAutolinkingPlugin.kt')
  let plugin = fs.readFileSync(pluginPath, 'utf8')
  if (!plugin.includes(MARKER)) {
    plugin = plugin.replace(
      /spec\.commandLine\(\s*"node",/,
      `spec.commandLine(\n            *NodeResolver.commandLine(\n              // ${MARKER}`,
    )
    if (!plugin.includes(MARKER)) {
      throw new Error('Failed to patch ExpoAutolinkingPlugin.kt (open)')
    }
    plugin = plugin.replace(
      /(watchedDirectoriesSerialized)\n(\s*)\)/,
      '$1.toString()\n            ).toTypedArray()\n$2)',
    )
    if (!plugin.includes(').toTypedArray()')) {
      throw new Error('Failed to patch ExpoAutolinkingPlugin.kt (close)')
    }
    writeFile(pluginPath, plugin)
    console.log('patched ExpoAutolinkingPlugin.kt')
  } else {
    console.log('ExpoAutolinkingPlugin.kt already patched')
  }

  patchExpoConstantsGradle()

  console.log('Setaside Expo Node patch complete')
}

function patchExpoConstantsGradle() {
  const candidates = [
    path.join(
      ROOT,
      'node_modules/expo/node_modules/expo-constants/scripts/get-app-config-android.gradle',
    ),
    path.join(ROOT, 'node_modules/expo-constants/scripts/get-app-config-android.gradle'),
  ]
  const filePath = candidates.find((p) => fs.existsSync(p))
  if (!filePath) {
    console.log('expo-constants get-app-config-android.gradle not found; skip')
    return
  }
  let src = fs.readFileSync(filePath, 'utf8')
  if (src.includes(MARKER)) {
    console.log('get-app-config-android.gradle already patched')
    return
  }

  const resolverBlock = `// ${MARKER}
def setasideResolveNode() {
  def fromEnv = System.getenv("NODE_BINARY")
  if (fromEnv && new File(fromEnv).canExecute()) return fromEnv
  def dir = rootProject.projectDir
  for (int i = 0; i < 8 && dir != null; i++) {
    def propsFile = new File(dir, "local.properties")
    if (propsFile.isFile()) {
      def props = new Properties()
      propsFile.withInputStream { props.load(it) }
      def p = props.getProperty("node.binary")
      if (p && new File(p.trim()).canExecute()) return p.trim()
    }
    def wrapper = new File(dir, "bin/node")
    if (wrapper.exists()) return wrapper.absolutePath
    dir = dir.parentFile
  }
  def home = System.getProperty("user.home")
  def nvm = new File("\${home}/.nvm/versions/node")
  if (nvm.isDirectory()) {
    def versions = nvm.listFiles()?.findAll { it.isDirectory() }?.sort { it.name }?.reverse()
    for (v in versions) {
      def n = new File(v, "bin/node")
      if (n.canExecute()) return n.absolutePath
    }
  }
  for (c in ["/usr/local/bin/node", "/usr/bin/node"]) {
    if (new File(c).canExecute()) return c
  }
  return "node"
}
def setasideNode = setasideResolveNode()
def setasideNodeCmd = {
  def f = new File(setasideNode)
  if (f.exists() && f.length() < 100000L && f.getText("UTF-8").contains("resolve_node")) {
    return ["/bin/bash", setasideNode]
  }
  return [setasideNode]
}()

`

  // Fix JS escaping: we want Groovy ${home} in the output file
  const resolverGroovy = resolverBlock.replace(
    '\\${home}',
    '${home}',
  )

  src = src.replace(
    /def expoConstantsDir = project\.providers\.exec \{\s*workingDir\(projectDir\)\s*commandLine\("node", "-e", "console\.log\(require\('path'\)\.dirname\(require\.resolve\('expo-constants\/package\.json'\)\)\);"\)\s*\}\.standardOutput\.asText\.get\(\)\.trim\(\)\s*\n\s*def config = project\.hasProperty\("react"\) \? project\.react : \[\];\s*\ndef nodeExecutableAndArgs = config\.nodeExecutableAndArgs \?: \["node"\]/,
    `${resolverGroovy}def expoConstantsDir = project.providers.exec {
  workingDir(projectDir)
  commandLine(*(setasideNodeCmd + ["-e", "console.log(require('path').dirname(require.resolve('expo-constants/package.json')));"]))
}.standardOutput.asText.get().trim()

def config = project.hasProperty("react") ? project.react : [];
def nodeExecutableAndArgs = config.nodeExecutableAndArgs ?: setasideNodeCmd`,
  )

  if (!src.includes(MARKER)) {
    throw new Error('Failed to patch get-app-config-android.gradle')
  }
  writeFile(filePath, src)
  console.log('patched get-app-config-android.gradle')
}

main()
