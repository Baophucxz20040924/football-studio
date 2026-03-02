const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    ip: { type: String, default: "" }
  },
  { timestamps: true }
);

ChatMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
