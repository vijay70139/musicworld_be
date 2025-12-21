require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const roomsRouter = require("./src/routes/roomRoutes");
const RoomService = require("./src/services/roomService");
const RoomModel = require("./src/models/Room");
const SongModel = require("./src/models/Song");
const userRoutes = require("./src/routes/userRoutes");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// REST endpoints
app.use("/api/rooms", roomsRouter);
app.use("/api/user", userRoutes);

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
  methods: ["GET", "POST", "DELETE"],
});

// Initialize RoomService with io (so it can emit)
RoomService.init(io);

// Socket handlers
io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("join_room", async ({ roomId, user }) => {
    if (!roomId || !user) {
      return socket.emit("error", { message: "invalid_payload" });
    }

    const roomExists = await RoomService.checkRoomExists(roomId);
    if (!roomExists) {
      return socket.emit("error", { message: "room_not_found" });
    }

    socket.join(roomId);

    await RoomService.addParticipant(roomId, user);

    // ✅ Single source of truth
    const state = await RoomService.getRoomState(roomId);

    // 🔥 Send to EVERYONE in room (including new user)
    io.to(roomId).emit("room_state", state);
  });

  socket.on("set_now_playing", async ({ roomId, song }) => {
    if (!roomId || !song) return;

    const nowPlaying = await RoomService.setNowPlaying(roomId, song);
    if (!nowPlaying) return;

    const state = await RoomService.getRoomState(roomId);
    io.to(roomId).emit("room_state", state);
  });

  socket.on("leave_room", async ({ roomId, userId }) => {
    if (!roomId) return;
    await RoomService.removeParticipant(roomId, userId);
    const participants = await RoomService.getParticipants(roomId);
    socket.leave(roomId);
    io.to(roomId).emit("participants_updated", { participants });
  });

  socket.on("add_song", async ({ roomId, song }) => {
    try {
      const room = await RoomModel.findById(roomId);
      if (!room) return;

      // 1️⃣ Ensure song exists globally
      let existingSong = await SongModel.findOne({ url: song.url });

      if (!existingSong) {
        existingSong = await SongModel.create(song);
      }

      // 2️⃣ Prevent duplicate in same room
      const alreadyInRoom = room.songs.some(
        (id) => id.toString() === existingSong._id.toString()
      );

      if (alreadyInRoom) {
        return socket.emit("error", {
          type: "SONG_ALREADY_IN_ROOM",
          message: "Song already exists in this room",
        });
      }

      // 3️⃣ Add to room playlist
      room.songs.push(existingSong._id);

      // 4️⃣ Auto set nowPlaying if empty
      if (!room.nowPlaying) {
        room.nowPlaying = existingSong._id;
      }

      await room.save();

      // 5️⃣ Emit updated state
      const populatedRoom = await RoomModel.findById(roomId)
        .populate("songs")
        .populate("nowPlaying");

      io.to(roomId).emit("playlist_updated", {
        playlist: populatedRoom.songs,
      });

      io.to(roomId).emit("now_playing", {
        nowPlaying: populatedRoom.nowPlaying,
      });
    } catch (err) {
      console.error("add_song socket error:", err);
      socket.emit("error", {
        type: "ADD_SONG_FAILED",
        message: "Failed to add song",
      });
    }
  });

  socket.on("remove_song", async ({ roomId, title }) => {
    await RoomService.removeSong(roomId, title);
    const playlist = await RoomService.getPlaylist(roomId);
    io.to(roomId).emit("playlist_updated", { playlist });
  });

  socket.on("skip_song", async ({ roomId }) => {
    if (!roomId) return;

    const result = await RoomService.skipSong(roomId);
    if (!result) return;
    const state = await RoomService.getRoomState(roomId);
    io.to(roomId).emit("room_state", state);
  });

  socket.on("previous_song", async ({ roomId }) => {
    if (!roomId) return;

    const result = await RoomService.previousSong(roomId);
    if (!result) return;

    io.to(roomId).emit("room_state", {
      nowPlaying: result.nowPlaying,
      songs: result.playlist,
    });
  });

  socket.on("play", ({ roomId, at }) => io.to(roomId).emit("play", { at }));
  socket.on("pause", ({ roomId, at }) => io.to(roomId).emit("pause", { at }));
  socket.on("seek", ({ roomId, position }) =>
    io.to(roomId).emit("seek", { position })
  );

  socket.on("sync_request", async ({ roomId }) => {
    const state = await RoomService.getRoomState(roomId);
    socket.emit("room_state", state);
  });

  socket.on("add_song_to_room", async ({ roomId, songId }) => {
    const room = await RoomModel.findById(roomId);
    if (!room) return;

    const exists = room.songs.some((id) => id.toString() === songId);

    if (!exists) {
      room.songs.push(songId);
      await room.save();
    }

    const populatedRoom = await RoomModel.findById(roomId)
      .populate("songs")
      .populate("nowPlaying");
    console.log(populatedRoom, "populatedRoom");

    // If nothing playing → auto start
    if (!populatedRoom.nowPlaying && populatedRoom.songs.length) {
      populatedRoom.nowPlaying = populatedRoom.songs[0];
      await populatedRoom.save();
    }

    io.to(roomId).emit("room_state", {
      songs: populatedRoom.songs,
      nowPlaying: populatedRoom.nowPlaying,
    });
  });

  socket.on("disconnect", async () => {
    // Best-effort: remove participant from all rooms and broadcast
    await RoomService.removeParticipantFromAll(socket.id);
  });
});

// Connect DB and start server
const PORT = process.env.PORT || 4000;
async function start() {
  console.log("Connecting to MongoDB...");
  console.log(process.env.MONGO_URI);
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.warn(
      "MongoDB connect failed — continuing with DB errors disabled",
      err.message
    );
  }

  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}
start();

process.on("uncaughtException", (err) => {
  console.error(err);
});
