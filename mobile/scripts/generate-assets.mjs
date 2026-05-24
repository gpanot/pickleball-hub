import sharp from 'sharp'
import { readFileSync } from 'fs'

const splashWidth = 1284
const splashHeight = 2778

const backgroundSvg = `<svg width="${splashWidth}" height="${splashHeight}" viewBox="0 0 ${splashWidth} ${splashHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${splashWidth}" height="${splashHeight}" fill="#0a0a0a"/>
  <ellipse cx="642" cy="1200" rx="500" ry="500" fill="#f5a623" opacity="0.04"/>
  <ellipse cx="642" cy="1200" rx="280" ry="280" fill="#f5a623" opacity="0.05"/>
</svg>`

const textOverlaySvg = `<svg width="${splashWidth}" height="${splashHeight}" viewBox="0 0 ${splashWidth} ${splashHeight}" xmlns="http://www.w3.org/2000/svg">
  <text x="642" y="1620" font-family="system-ui, -apple-system, sans-serif" font-size="96" font-weight="700" text-anchor="middle" letter-spacing="-2"><tspan fill="white">Squad</tspan><tspan fill="#f5a623">d</tspan></text>
  <text x="642" y="1700" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="400" fill="#444444" text-anchor="middle" letter-spacing="4">WHERE YOUR GAME IS</text>
  <rect x="610" y="2700" width="64" height="6" rx="3" fill="#f5a623" opacity="0.6"/>
</svg>`

const androidResBase = 'android/app/src/main/res'

const densities = [
  { name: 'mdpi',    splashSize: 100, iconSize: 48, foregroundSize: 108, notifSize: 24 },
  { name: 'hdpi',    splashSize: 150, iconSize: 72, foregroundSize: 162, notifSize: 36 },
  { name: 'xhdpi',   splashSize: 200, iconSize: 96, foregroundSize: 216, notifSize: 48 },
  { name: 'xxhdpi',  splashSize: 300, iconSize: 144, foregroundSize: 324, notifSize: 72 },
  { name: 'xxxhdpi', splashSize: 400, iconSize: 192, foregroundSize: 432, notifSize: 96 },
]

async function generate() {
  const iconSource = readFileSync('assets/lion-source.png')

  // --- Expo assets ---
  console.log('Generating assets/icon.png...')
  await sharp(iconSource).resize(1024, 1024).png().toFile('assets/icon.png')

  console.log('Generating assets/splash.png...')
  const iconForSplash = await sharp(iconSource).resize(360, 360).png().toBuffer()
  const textOverlay = await sharp(Buffer.from(textOverlaySvg))
    .resize(splashWidth, splashHeight).png().toBuffer()
  await sharp(Buffer.from(backgroundSvg))
    .resize(splashWidth, splashHeight)
    .composite([
      { input: iconForSplash, top: 1050, left: Math.round((splashWidth - 360) / 2) },
      { input: textOverlay, top: 0, left: 0 },
    ])
    .png()
    .toFile('assets/splash.png')

  console.log('Generating assets/notification-icon.png...')
  await sharp(iconSource)
    .resize(96, 96)
    .greyscale()
    .threshold(1)
    .negate({ alpha: false })
    .png()
    .toFile('assets/notification-icon.png')

  // --- Android native resources ---
  for (const d of densities) {
    const drawableDir = `${androidResBase}/drawable-${d.name}`
    const mipmapDir = `${androidResBase}/mipmap-${d.name}`

    // Splash screen logo
    console.log(`Generating ${drawableDir}/splashscreen_logo.png (${d.splashSize}px)...`)
    await sharp(iconSource)
      .resize(d.splashSize, d.splashSize)
      .png()
      .toFile(`${drawableDir}/splashscreen_logo.png`)

    // Notification icon (white silhouette from lion source)
    console.log(`Generating ${drawableDir}/notification_icon.png (${d.notifSize}px)...`)
    await sharp(iconSource)
      .resize(d.notifSize, d.notifSize)
      .greyscale()
      .threshold(1)
      .negate({ alpha: false })
      .png()
      .toFile(`${drawableDir}/notification_icon.png`)

    // Launcher icon (foreground for adaptive icon)
    console.log(`Generating ${mipmapDir}/ic_launcher_foreground.webp (${d.foregroundSize}px)...`)
    await sharp(iconSource)
      .resize(d.foregroundSize, d.foregroundSize)
      .webp()
      .toFile(`${mipmapDir}/ic_launcher_foreground.webp`)

    // Launcher icon (regular)
    console.log(`Generating ${mipmapDir}/ic_launcher.webp (${d.iconSize}px)...`)
    await sharp(iconSource)
      .resize(d.iconSize, d.iconSize)
      .webp()
      .toFile(`${mipmapDir}/ic_launcher.webp`)

    // Launcher icon (round)
    console.log(`Generating ${mipmapDir}/ic_launcher_round.webp (${d.iconSize}px)...`)
    const roundMask = Buffer.from(
      `<svg width="${d.iconSize}" height="${d.iconSize}">` +
      `<circle cx="${d.iconSize/2}" cy="${d.iconSize/2}" r="${d.iconSize/2}" fill="white"/>` +
      `</svg>`
    )
    await sharp(iconSource)
      .resize(d.iconSize, d.iconSize)
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .webp()
      .toFile(`${mipmapDir}/ic_launcher_round.webp`)
  }

  console.log('\nAll assets generated successfully.')
}

generate().catch(console.error)
