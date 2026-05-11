const sharp = require('C:/Users/fract/AppData/Roaming/npm/node_modules/sharp')
const path = require('path')
const fs = require('fs')

const dir = path.join(__dirname)

// App icon SVG: green background, large heart-in-hands centered
const iconSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#2D5A3D"/>
  <!-- Left arm -->
  <path d="M148 780 C82 708 72 614 104 526 C136 438 212 400 252 444 L252 628 C252 678 288 720 346 742 L512 778"
        fill="none" stroke="#F5EDD8" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Right arm -->
  <path d="M876 780 C942 708 952 614 920 526 C888 438 812 400 772 444 L772 628 C772 678 736 720 678 742 L512 778"
        fill="none" stroke="#F5EDD8" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Palm base -->
  <path d="M252 628 Q512 800 772 628"
        fill="none" stroke="#F5EDD8" stroke-width="64" stroke-linecap="round"/>
  <!-- Heart shadow -->
  <path d="M512 390
           C512 390 438 300 360 342
           C282 384 282 490 360 564
           L512 720
           L664 564
           C742 490 742 384 664 342
           C586 300 512 390 512 390 Z"
        fill="#A06830" opacity="0.3" transform="translate(8,12)"/>
  <!-- Heart fill -->
  <path d="M512 390
           C512 390 438 300 360 342
           C282 384 282 490 360 564
           L512 720
           L664 564
           C742 490 742 384 664 342
           C586 300 512 390 512 390 Z"
        fill="#C9904A"/>
  <!-- Heart highlight -->
  <circle cx="428" cy="392" r="42" fill="white" opacity="0.22"/>
</svg>`

// Adaptive icon foreground SVG: transparent background, smaller graphic centered (safe zone = inner 66%)
const adaptiveSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Left arm -->
  <path d="M218 750 C158 684 150 600 178 522 C206 444 272 410 308 450 L308 610 C308 654 340 692 390 712 L512 736"
        fill="none" stroke="#F5EDD8" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Right arm -->
  <path d="M806 750 C866 684 874 600 846 522 C818 444 752 410 716 450 L716 610 C716 654 684 692 634 712 L512 736"
        fill="none" stroke="#F5EDD8" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Palm base -->
  <path d="M308 610 Q512 752 716 610"
        fill="none" stroke="#F5EDD8" stroke-width="56" stroke-linecap="round"/>
  <!-- Heart shadow -->
  <path d="M512 406
           C512 406 446 326 376 364
           C306 402 306 498 376 566
           L512 706
           L648 566
           C718 498 718 402 648 364
           C578 326 512 406 512 406 Z"
        fill="#A06830" opacity="0.3" transform="translate(6,10)"/>
  <!-- Heart fill -->
  <path d="M512 406
           C512 406 446 326 376 364
           C306 402 306 498 376 566
           L512 706
           L648 566
           C718 498 718 402 648 364
           C578 326 512 406 512 406 Z"
        fill="#C9904A"/>
  <!-- Heart highlight -->
  <circle cx="438" cy="408" r="36" fill="white" opacity="0.22"/>
</svg>`

// Splash icon SVG: used on parchment background - green hands/heart, larger
const splashSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- Left arm -->
  <path d="M72 390 C40 352 36 306 52 262 C68 218 104 200 124 222 L124 314 C124 338 142 360 172 370 L256 388"
        fill="none" stroke="#2D5A3D" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Right arm -->
  <path d="M440 390 C472 352 476 306 460 262 C444 218 408 200 388 222 L388 314 C388 338 370 360 340 370 L256 388"
        fill="none" stroke="#2D5A3D" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Palm base -->
  <path d="M124 314 Q256 398 388 314"
        fill="none" stroke="#2D5A3D" stroke-width="30" stroke-linecap="round"/>
  <!-- Heart shadow -->
  <path d="M256 196
           C256 196 219 150 180 170
           C141 190 141 244 180 280
           L256 358
           L332 280
           C371 244 371 190 332 170
           C293 150 256 196 256 196 Z"
        fill="#A06830" opacity="0.25" transform="translate(4,5)"/>
  <!-- Heart fill -->
  <path d="M256 196
           C256 196 219 150 180 170
           C141 190 141 244 180 280
           L256 358
           L332 280
           C371 244 371 190 332 170
           C293 150 256 196 256 196 Z"
        fill="#C9904A"/>
  <!-- Heart highlight -->
  <circle cx="216" cy="198" r="20" fill="white" opacity="0.25"/>
</svg>`

async function gen() {
  // 1. icon.png — 1024x1024
  await sharp(Buffer.from(iconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(dir, 'icon.png'))
  console.log('icon.png done')

  // 2. adaptive-icon.png — 1024x1024 transparent foreground
  await sharp(Buffer.from(adaptiveSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(dir, 'adaptive-icon.png'))
  console.log('adaptive-icon.png done')

  // 3. splash-icon.png — 200x200 on parchment background
  const splashBg = await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 247, g: 245, b: 240, alpha: 1 } }
  }).png().toBuffer()

  const splashFg = await sharp(Buffer.from(splashSvg))
    .resize(160, 160)
    .png()
    .toBuffer()

  await sharp(splashBg)
    .composite([{ input: splashFg, top: 20, left: 20 }])
    .toFile(path.join(dir, 'splash-icon.png'))
  console.log('splash-icon.png done')

  // 4. favicon.png — 48x48
  await sharp(Buffer.from(iconSvg))
    .resize(48, 48)
    .png()
    .toFile(path.join(dir, 'favicon.png'))
  console.log('favicon.png done')

  console.log('All assets generated.')
}

gen().catch(console.error)
