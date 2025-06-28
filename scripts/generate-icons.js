const fs = require('fs');
const path = require('path');

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon sizes for different platforms
const iconSizes = {
    favicon: [16, 32],
    apple: [57, 60, 72, 76, 114, 120, 144, 152, 180],
    android: [36, 48, 72, 96, 144, 192],
    windows: [70, 150, 310],
    general: [16, 32, 48, 64, 128, 256, 512]
};

// SVG template for the icon
const iconSVG = `
<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2ECC71;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#27AE60;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background Circle -->
  <circle cx="{center}" cy="{center}" r="{radius}" fill="url(#iconGradient)" stroke="#2ECC71" stroke-width="{stroke}"/>
  
  <!-- Chat Stack Icon -->
  <g transform="translate({iconX}, {iconY})">
    <!-- Chat Bubble 1 (back) -->
    <rect x="0" y="0" width="{bubbleW}" height="{bubbleH}" rx="{bubbleR}" ry="{bubbleR}" fill="white" opacity="0.6"/>
    
    <!-- Chat Bubble 2 (middle) -->
    <rect x="{bubbleOffset}" y="{bubbleOffset}" width="{bubbleW}" height="{bubbleH}" rx="{bubbleR}" ry="{bubbleR}" fill="white" opacity="0.8"/>
    
    <!-- Chat Bubble 3 (front) -->
    <rect x="{bubbleOffset2}" y="{bubbleOffset2}" width="{bubbleW}" height="{bubbleH}" rx="{bubbleR}" ry="{bubbleR}" fill="white" opacity="1"/>
  </g>
</svg>
`;

// Function to generate SVG with specific size
function generateSVG(size) {
    const center = size / 2;
    const radius = (size * 0.45);
    const stroke = Math.max(1, size * 0.03);
    const iconSize = size * 0.5;
    const iconX = (size - iconSize) / 2;
    const iconY = (size - iconSize) / 2;
    const bubbleW = iconSize * 0.25;
    const bubbleH = iconSize * 0.1875;
    const bubbleR = bubbleH / 2;
    const bubbleOffset = iconSize * 0.09375;
    const bubbleOffset2 = iconSize * 0.1875;

    return iconSVG
        .replace(/{size}/g, size)
        .replace(/{center}/g, center)
        .replace(/{radius}/g, radius)
        .replace(/{stroke}/g, stroke)
        .replace(/{iconX}/g, iconX)
        .replace(/{iconY}/g, iconY)
        .replace(/{bubbleW}/g, bubbleW)
        .replace(/{bubbleH}/g, bubbleH)
        .replace(/{bubbleR}/g, bubbleR)
        .replace(/{bubbleOffset}/g, bubbleOffset)
        .replace(/{bubbleOffset2}/g, bubbleOffset2);
}

// Function to generate all icons
async function generateIcons() {
    console.log('🎨 Generating Novi app icons...\n');

    const allSizes = new Set();
    Object.values(iconSizes).flat().forEach(size => allSizes.add(size));

    for (const size of allSizes) {
        try {
            const svg = generateSVG(size);
            const filename = `icon-${size}x${size}.svg`;
            const filepath = path.join(iconsDir, filename);
            
            fs.writeFileSync(filepath, svg);
            console.log(`✅ Generated: ${filename}`);
        } catch (error) {
            console.error(`❌ Error generating ${size}x${size} icon:`, error);
        }
    }

    // Generate favicon.ico equivalent (SVG)
    const faviconSVG = generateSVG(32);
    const faviconPath = path.join(__dirname, '..', 'public', 'favicon.svg');
    fs.writeFileSync(faviconPath, faviconSVG);
    console.log('✅ Generated: favicon.svg');

    // Generate manifest icons list
    const manifestIcons = [];
    [16, 32, 48, 64, 128, 256, 512].forEach(size => {
        manifestIcons.push({
            src: `/icons/icon-${size}x${size}.svg`,
            sizes: `${size}x${size}`,
            type: 'image/svg+xml'
        });
    });

    // Create manifest.json
    const manifest = {
        name: 'Novi - Smart Commerce Suite',
        short_name: 'Novi',
        description: 'WhatsApp-native commerce platform',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2ECC71',
        icons: manifestIcons
    };

    
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✅ Generated: manifest.json');

    console.log('\n🎉 Icon generation completed!');
    console.log(`📁 Icons saved in: ${iconsDir}`);
    console.log('\n📋 Generated Files:');
    console.log('   • favicon.svg');
    console.log('   • manifest.json');
    console.log('   • icon-16x16.svg to icon-512x512.svg');
    console.log('\n🚀 Ready for web app deployment!');
}

// Run the script
if (require.main === module) {
    generateIcons().catch(console.error);
}

module.exports = { generateIcons, generateSVG }; 