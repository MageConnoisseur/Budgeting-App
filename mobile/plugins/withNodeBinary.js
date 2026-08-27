const { withAppBuildGradle, withDangerousMod, withSettingsGradle } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const RESOLVER = `  def resolveNode() {
    def fromEnv = System.getenv("NODE_BINARY")
    if (fromEnv && new File(fromEnv).exists()) return fromEnv
    def propsFile = new File(rootDir, "local.properties")
    if (propsFile.exists()) {
      def props = new Properties()
      propsFile.withInputStream { props.load(it) }
      def fromProps = props.getProperty("node.binary") ?: props.getProperty("nodejs.dir")
      if (fromProps) {
        def f = new File(fromProps.trim())
        if (f.isDirectory()) f = new File(f, "node")
        if (f.exists()) return f.absolutePath
      }
    }
    def home = System.getProperty("user.home")
    def hits = []
    (System.getenv("PATH") ?: "").split(File.pathSeparator).each {
      hits << new File(it, "node").absolutePath
    }
    ["/usr/local/bin/node", "/usr/bin/node", "/opt/homebrew/bin/node"].each { hits << it }
    def nvm = new File("\${home}/.nvm/versions/node")
    if (nvm.isDirectory()) {
      nvm.listFiles()?.findAll { it.isDirectory() }?.sort { it.name }?.reverse()?.each {
        hits.add(0, new File(it, "bin/node").absolutePath)
      }
    }
    for (p in hits) {
      if (new File(p).exists()) return p
    }
    throw new GradleException("Could not find Node.js. Install Node 22, run npm install in mobile/, and set node.binary in android/local.properties to the output of: which node")
  }
  def nodeBinary = resolveNode()
`

function withNodeBinary(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const src = path.join(mod.modRequest.projectRoot, 'android', 'findNode.gradle')
      const dest = path.join(mod.modRequest.platformProjectRoot, 'findNode.gradle')
      if (fs.existsSync(src) && path.resolve(src) !== path.resolve(dest)) {
        fs.copyFileSync(src, dest)
      }
      return mod
    },
  ])

  config = withSettingsGradle(config, (mod) => {
    let contents = mod.modResults.contents
    contents = contents.replaceAll('commandLine("node",', 'commandLine(nodeBinary,')
    if (!contents.includes('def resolveNode()')) {
      contents = contents.replace(
        'pluginManagement {',
        `pluginManagement {\n${RESOLVER}`,
      )
    }
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
