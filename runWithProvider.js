const dotenv = require('dotenv');
const { execSync } = require('child_process');
dotenv.config();

const { DATABASE_PROVIDER } = process.env;
const databaseProviderDefault = DATABASE_PROVIDER ?? "postgresql"

if (!DATABASE_PROVIDER) {
  console.error(`DATABASE_PROVIDER is not set in the .env file, using default: ${databaseProviderDefault}`);
  // process.exit(1);
}

const command = process.argv
  .slice(2)
  .join(' ')
  .replace(/\DATABASE_PROVIDER/g, databaseProviderDefault);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  console.error(`Error executing command: ${command}`);
  process.exit(1);
}
