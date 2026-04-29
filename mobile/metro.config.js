const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// In an npm workspace, native RN packages can exist in both mobile/node_modules
// (from pre-workspace install) and root/node_modules (hoisted by npm workspaces).
// Metro bundling two copies causes "Tried to register two views with the same name".
// Force these packages to always resolve from mobile/node_modules.
const DEDUPE_PACKAGES = [
  'react',
  'react-native',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-gesture-handler',
  'react-native-reanimated',
]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const base = moduleName.split('/')[0]
  if (DEDUPE_PACKAGES.includes(base)) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform
    )
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
