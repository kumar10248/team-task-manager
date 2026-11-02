const path = require('path');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // Fallback for cwd
require('./src/config/db');
const app = require('./app');

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server is running at PORT ${PORT}`);
});