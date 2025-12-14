require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const roomsRouter = require("./src/routes/roomRoutes");
const RoomService = require("./src/services/roomService");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// REST endpoints
app.use("/api/rooms", roomsRouter);

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
    if (!roomId || !user)
      return socket.emit("error", { message: "invalid_payload" });

    const roomExists = await RoomService.checkRoomExists(roomId);
    if (!roomExists) return socket.emit("error", { message: "room_not_found" });

    socket.join(roomId);
    await RoomService.addParticipant(roomId, user);

    // emit participant updates to room
    const participants = await RoomService.getParticipants(roomId);
    io.to(roomId).emit("user_joined", {
      id: socket.id,
      name: user,
      participants,
    });

    // send full room state to the joining socket
    const state = await RoomService.getRoomState(roomId);
    socket.emit("room_state", state);
  });

  socket.on("leave_room", async ({ roomId, userId }) => {
    if (!roomId) return;
    await RoomService.removeParticipant(roomId, userId);
    const participants = await RoomService.getParticipants(roomId);
    socket.leave(roomId);
    io.to(roomId).emit("user_left", { id: socket.id, participants });
  });

  socket.on("add_song", async ({ roomId, song }) => {
    if (!roomId || !song) return;

    const addedSong = await RoomService.addSong(roomId, song);
    if (!addedSong) return;

    let nowPlaying = await RoomService.getNowPlaying(roomId);

    // If first song → auto play
    if (!nowPlaying) {
      await RoomService.setNowPlaying(roomId, addedSong);
      nowPlaying = addedSong;

      io.to(roomId).emit("now_playing", { nowPlaying });
    }

    const playlist = await RoomService.getPlaylist(roomId);

    io.to(roomId).emit("playlist_updated", { playlist });
  });

  socket.on("remove_song", async ({ roomId, title }) => {
    await RoomService.removeSong(roomId, title);
    const playlist = await RoomService.getPlaylist(roomId);
    io.to(roomId).emit("playlist_updated", { playlist });
  });

  socket.on("skip_song", async ({ roomId }) => {
    const result = await RoomService.skipSong(roomId);
    if (!result) return;

    io.to(roomId).emit("now_playing", {
      nowPlaying: result.nowPlaying,
    });

    io.to(roomId).emit("playlist_updated", {
      playlist: result.playlist,
    });
  });

  // Host controls -> broadcast to room
  socket.on("play", ({ roomId, at }) => io.to(roomId).emit("play", { at }));
  socket.on("pause", ({ roomId, at }) => io.to(roomId).emit("pause", { at }));
  socket.on("seek", ({ roomId, position }) =>
    io.to(roomId).emit("seek", { position })
  );

  socket.on("sync_request", async ({ roomId }) => {
    const state = await RoomService.getRoomState(roomId);
    socket.emit("room_state", state);
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
