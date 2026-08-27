const { removeBackground } = require('@imgly/background-removal');
const fs = require('fs');

try {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1, configurable: true });
} catch (e) {
  console.log('thread patch skipped:', e.message);
}

process.__blobStore = new Map();
process.__blobCounter = 0;
const origCreate = URL.createObjectURL;
URL.createObjectURL = (blob) => {
  const url = 'blob:nodedata:custom-' + (++process.__blobCounter);
  process.__blobStore.set(url, blob);
  return url;
};

const inputPath = process.argv[2];
const outputPath = process.argv[3];

async function main() {
  const file = fs.readFileSync(inputPath);
  const blob = new Blob([file]);
  const result = await removeBackground(blob, {
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      console.log(`progress: ${key} ${current}/${total}`);
    },
  });
  const buffer = Buffer.from(await result.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`Wrote ${buffer.length} bytes to ${outputPath}`);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
