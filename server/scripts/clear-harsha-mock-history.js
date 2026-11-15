const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const users = db.collection('users');
  const subscriptions = db.collection('subscriptions');

  const harsha = await users.findOne({ email: { $regex: /harshay\.131@gmail\.com/i } });
  if (!harsha) {
    console.error('❌ Harsha user not found');
    process.exit(1);
  }

  // Clear all mock/test history for Harsha
  await subscriptions.updateOne(
    { user: harsha._id },
    {
      $set: {
        history: [],
        razorpayPaymentId: null,
        razorpayOrderId: null,
        razorpaySignature: null,
      },
    }
  );

  console.log('✅ All mock/test payment history completely cleared for Harsha (harshay.131@gmail.com)!');
  const sub = await subscriptions.findOne({ user: harsha._id });
  console.log('Current history array length:', sub.history?.length || 0);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
