#!/usr/bin/env node
const { createCanvas } = require('canvas');
const fs = require('fs');

// Render text to PNG using node-canvas
function renderTextToPng(text, outputPath, width = 1080, height = 1920) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1e3a8a');
  gradient.addColorStop(1, '#7c3aed');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Text
  ctx.fillStyle = 'white';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Wrap text if too long
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > width - 100) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);

  // Draw lines
  const lineHeight = 100;
  const startY = (height - lines.length * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight + lineHeight / 2);
  });

  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
}

// CLI usage
if (require.main === module) {
  const text = process.argv[2] || 'AI Content Agent Test';
  const output = process.argv[3] || 'output.png';
  renderTextToPng(text, output);
  console.log(`✅ Generated: ${output}`);
}

module.exports = { renderTextToPng };
