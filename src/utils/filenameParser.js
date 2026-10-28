// macOS 放最前面：darwin 里含 "win"，先匹配 windows 会误判
const OS_PATTERNS = [
  { pattern: /macos|mac\s?os|darwin|osx|\.dmg$/i, os: 'macos' },
  { pattern: /linux|\.deb$|\.rpm$|\.appimage$|\.flatpak$/i, os: 'linux' },
  { pattern: /windows|\bwin(?:32|64)?\b|\.exe$|\.msi$/i, os: 'windows' },
]

const ARCH_PATTERNS = [
  { pattern: /\b(?:x64|amd64|x86[_-]64)\b/i, arch: 'x64' },
  { pattern: /\b(?:arm64|aarch64)\b/i, arch: 'arm64' },
  { pattern: /\b(?:universal|all)\b/i, arch: 'universal' },
]

export function parseFilename(filename) {
  let os = null
  let arch = null

  for (const { pattern, os: detectedOs } of OS_PATTERNS) {
    if (pattern.test(filename)) {
      os = detectedOs
      break
    }
  }

  for (const { pattern, arch: detectedArch } of ARCH_PATTERNS) {
    if (pattern.test(filename)) {
      arch = detectedArch
      break
    }
  }

  return { os, arch }
}

export function getOSIcon(os) {
  switch (os) {
    case 'linux':
      return '🐧'
    case 'windows':
      return '🪟'
    case 'macos':
      return '🍎'
    default:
      return '📦'
  }
}

export function getOSLabel(os) {
  switch (os) {
    case 'linux':
      return 'Linux'
    case 'windows':
      return 'Windows'
    case 'macos':
      return 'macOS'
    default:
      return 'Unknown'
  }
}

export function getArchLabel(arch) {
  switch (arch) {
    case 'x64':
      return 'x64'
    case 'arm64':
      return 'ARM64'
    case 'universal':
      return 'Universal'
    default:
      return ''
  }
}
