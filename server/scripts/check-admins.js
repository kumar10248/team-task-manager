const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI is missing in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = await mongoose.connection.collection('users')
    .find({}, { projection: { email: 1, name: 1, isSuperAdmin: 1, role: 1, createdAt: 1 } })
    .toArray();

  console.log('\n================ PLATFORM ACCOUNTS ================');
  if (users.length === 0) {
    console.log('No accounts found in database.');
  } else {
    users.forEach((u, i) => {
      const isSA = Boolean(u.isSuperAdmin);
      const badge = isSA ? '👑 [SUPER ADMIN]' : '👤 [Regular User]';
      console.log(`${i + 1}. ${badge} ${u.name || 'Unnamed'} <${u.email}>`);
    });
  }
  console.log('===================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
