const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    driverId:     { type: String, required: true, index: true },
    dispatcherId: { type: String, default: null },
    fromDriver:   { type: Boolean, required: true },
    text:         { type: String, required: true, trim: true, maxlength: 1000 },
    read:         { type: Boolean, default: false },
    readAt:       { type: Date,   default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Message", messageSchema);
