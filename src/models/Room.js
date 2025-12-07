const mongoose = require("mongoose");

const SongSchema = new mongoose.Schema({
  url: String,
  title: String,
  duration: Number,
});

const ParticipantSchema = new mongoose.Schema({
  user: { type: String, required: true },
});

const RoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    songs: { type: [SongSchema], default: [] },
    nowPlaying: { type: SongSchema, default: null },
    participants: { type: [ParticipantSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", RoomSchema);
