const mongoose = require("mongoose")

const UserSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: true,
    trim:     true,
  },
  email: {
    type:      String,
    required:  true,
    unique:    true,
    lowercase: true,
    trim:      true,
  },
  password: {
    type:     String,
    required: true,
    select:   false,   // never returned in queries unless explicitly .select("+password")
  },
  role: {
    type:    String,
    enum:    ["admin", "member"],
    default: "member",
  },
  refreshToken: {
    type:    String,
    default: null,
    select:  false,
  },
  passwordChangedAt: {
    type:    Date,
    default: null,
    select:  false,
  },
}, { timestamps: true })

UserSchema.index({ email: 1 })

module.exports = mongoose.model("User", UserSchema)
