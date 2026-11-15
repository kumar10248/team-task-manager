const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI is not set in server/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const User = mongoose.connection.collection('users');

  if (targetEmail) {
    const user = await User.findOne({ email: targetEmail });
    if (!user) {
      console.error(`❌ No user found with email: ${targetEmail}`);
      const allUsers = await User.find({}, { projection: { email: 1, name: 1, isSuperAdmin: 1 } }).toArray();
      console.log('\nAvailable users:');
      allUsers.forEach((u) => console.log(` - ${u.email} (${u.name || 'No Name'}) ${u.isSuperAdmin ? '👑 Super Admin' : ''}`));
      process.exit(1);
    }

    await User.updateOne({ _id: user._id }, { $set: { isSuperAdmin: true } });
    console.log(`\n🎉 Success! User "${user.name}" (${user.email}) is now a 👑 SUPER ADMIN!`);
  } else {
    // If no email passed, find first user or list users
    const users = await User.find({}, { projection: { email: 1, name: 1, isSuperAdmin: 1 } }).toArray();
    if (users.length === 0) {
      console.log('No users found in database. Register an account first!');
      process.exit(0);
    }

    const firstUser = users[0];
    await User.updateOne({ _id: firstUser._id }, { $set: { isSuperAdmin: true } });
    console.log(`\n🎉 Designated first user "${firstUser.name}" (${firstUser.email}) as 👑 SUPER ADMIN!`);

    console.log('\nAll users status:');
    users.forEach((u) => {
      const isSA = u._id.equals(firstUser._id) || u.isSuperAdmin;
      console.log(` - ${u.email} (${u.name || 'No Name'}) ${isSA ? '👑 Super Admin' : ''}`);
    });
  }

  console.log('\n👉 You can now navigate to http://localhost:3000/super-admin or click "Super Admin" in the sidebar.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
