const mongoose = require("mongoose");

const SongSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true },
    title: { type: String, required: true },
  },
);

module.exports = mongoose.model("Song", SongSchema);
