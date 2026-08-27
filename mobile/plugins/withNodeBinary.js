const { withAppBuildGradle, withDangerousMod, withSettingsGradle } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

function copyIfExists(src, dest) {
  if (fs.existsSync(src) && path.resolve(src) !== path.resolve(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    try {
      fs.chmodSync(dest, 0o755)
    } catch {
      // Best-effort; setup-android-studio.sh also chmods.
    }
  }
}

function withNodeBinary(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const androidSrc = path.join(mod.modRequest.projectRoot, 'android')
      const androidDest = mod.modRequest.platformProjectRoot
      for (const rel of ['findNode.gradle', 'ensureNodePath.gradle', 'bin/node']) {
        copyIfExists(path.join(androidSrc, rel), path.join(androidDest, rel))
      }
      const gradlew = path.join(androidDest, 'gradlew')
      if (fs.existsSync(gradlew)) {
        let text = fs.readFileSync(gradlew, 'utf8')
        if (!text.includes("APP_HOME/bin/node")) {
          text = text.replace(
            'APP_HOME=$( cd -P "${APP_HOME:-./}" > /dev/null && printf \'%s\\n\' "$PWD" ) || exit\n',
            'APP_HOME=$( cd -P "${APP_HOME:-./}" > /dev/null && printf \'%s\\n\' "$PWD" ) || exit\n\n# Setaside: prepend android/bin so Gradle can run node\nif [ -x "$APP_HOME/bin/node" ]; then\n    PATH="$APP_HOME/bin:$PATH"\n    export PATH\nfi\n',
          )
          fs.writeFileSync(gradlew, text)
        }
      }
      return mod
    },
  ])

  config = withSettingsGradle(config, (mod) => {
    let contents = mod.modResults.contents
    contents = contents.replaceAll(
      'commandLine("node",',
      'commandLine("/bin/bash", new File(rootDir, "bin/node").absolutePath,',
    )
    mod.modResults.contents = contents
    return mod
  })

  config = withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents
    if (!contents.includes('findNode.gradle')) {
      contents = `apply from: new File(rootDir, "findNode.gradle")\n\n${contents}`
    }
    contents = contents.replaceAll('["node",', '[NODE_BINARY,')
    if (!contents.includes('nodeExecutableAndArgs = [NODE_BINARY]')) {
      contents = contents.replace(
        'react {',
        'react {\n    nodeExecutableAndArgs = [NODE_BINARY]',
      )
    }
    mod.modResults.contents = contents
    return mod
  })

  return config
}

module.exports = withNodeBinary
