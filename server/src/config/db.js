require('dotenv').config();
const mongoose = require('mongoose');
const URI = process.env.MONGO_URI

mongoose
  .connect(URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log('Connected to mongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

module.exports = mongoose;
