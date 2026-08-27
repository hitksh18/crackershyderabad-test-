const { removeBackground } = require('@imgly/background-removal');
const fs = require('fs');

try {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1, configurable: true });
} catch (e) {
  console.log('thread patch skipped:', e.message);
}

async function main() {
  const file = fs.readFileSync(process.argv[2]);
  const blob = new Blob([file]);
  const result = await removeBackground(blob, {
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      console.log(`progress: ${key} ${current}/${total}`);
    },
  });
  const buffer = Buffer.from(await result.arrayBuffer());
  fs.writeFileSync(process.argv[3], buffer);
  console.log(`Wrote ${buffer.length} bytes to ${process.argv[3]}`);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
