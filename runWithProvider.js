const dotenv = require('dotenv');
const { execSync } = require('child_process');
dotenv.config();

const { DATABASE_PROVIDER } = process.env;

if (!DATABASE_PROVIDER) {
  console.error('DATABASE_PROVIDER is not set in the .env file');
  process.exit(1);
}

const command = process.argv
  .slice(2)
  .join(' ')
  .replace(/\DATABASE_PROVIDER/g, DATABASE_PROVIDER);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  console.error(`Error executing command: ${command}`);
  process.exit(1);
}
