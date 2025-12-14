const RoomModel = require("../models/Room");

let io = null;

module.exports = {
  init(ioInstance) {
    io = ioInstance;
  },

  // create room
  async createRoom(name, hostName) {
    try {
      const room = await RoomModel.create({
        name,
        participants: [
          {
            user: hostName,
            role: "host", // host permission
          },
        ],
        songs: [],
        nowPlaying: null,
      });

      return room.toObject();
    } catch (error) {
      console.error("createRoom failed:", error.message);
      throw new Error("Could not create room");
    }
  },

  async checkRoomExists(roomId) {
    try {
      const r =
        (await RoomModel.findById(roomId).lean()) ||
        (await RoomModel.findOne({ code: roomId }).lean());
      console.log("checkRoomExists found in DB:", !!r);
      return !!r;
    } catch (err) {
      console.log("checkRoomExists error:", err.message);
      return false;
    }
  },

  async getRoom(roomId) {
    try {
      const r = await RoomModel.findOne({ _id: roomId }).lean();
      if (r) return r;
    } catch (err) {}
    console.log("getRoom", err?.message);
  },

  async getAllRooms() {
    try {
      const rooms = await RoomModel.find({}, "_id name participants").lean();
      return rooms;
    } catch (err) {
      console.log("getAllRooms error:", err?.message);
      return [];
    }
  },

  async addParticipant(roomId, user) {
    try {
      let isUserAdded = null;
      let newParticipantAdded = null;
      const room = await RoomModel.findById(roomId);
      console.log("room: ", room);

      if (!room) return null; // ❌ Room not found

      // Generate unique participant ID
      const newParticipant = {
        user: user,
      };

      // Avoid duplicate join
      const alreadyExists = room.participants.some(
        (p) => p.user.toLowerCase() === user.toLowerCase()
      );

      if (!alreadyExists) {
        room.participants.push(newParticipant);
        await room.save();
        isUserAdded = true;
        newParticipantAdded = newParticipant;
      } else {
        isUserAdded = false;
      }

      return { room, isUserAdded, newParticipantAdded }; // ✔ sends updated list
    } catch (err) {
      console.error("addParticipant Service Error:", err.message);
      return null;
    }
  },

  async removeParticipantFromAll(socketId) {
    try {
      const rooms = await RoomModel.find({
        participants: { $elemMatch: { id: socketId } },
      });

      if (!rooms.length) return;

      await RoomModel.updateMany(
        {},
        { $pull: { participants: { id: socketId } } }
      );

      rooms.forEach((room) => {
        io.to(room._id.toString()).emit("participants_updated", {
          participants: room.participants.filter((p) => p.id !== socketId),
        });
      });
    } catch (err) {
      console.error("removeParticipantFromAll error:", err);
    }
  },

  async addSong(roomId, songData) {
    try {
      const room = await RoomModel.findById(roomId);
      if (!room) return null;

      // prevent duplicates (by title or url)
      const exists = room.songs.some(
        (s) => s.title === songData.title || s.url === songData.url
      );

      if (!exists) {
        room.songs.push(songData);
        await room.save(); // ✅ IMPORTANT
      }

      return songData; // return added song
    } catch (err) {
      console.error("addSong Service Error:", err.message);
      return null;
    }
  },

  async getPlaylist(roomId) {
    const r = await this.getRoom(roomId);
    return r ? r.songs || [] : [];
  },

  async setNowPlaying(roomId, title) {
    try {
      const room = await RoomModel.findOne({ _id: roomId });

      if (!room) return null;

      const songObj = room.songs.find(
        (song) => song.title.toLowerCase() === title.toLowerCase()
      );
      if (!songObj) return null;

      room.nowPlaying = songObj;
      await room.save();
      return songObj;
    } catch (err) {
      console.error("setNowPlaying service error:", err.message);
      return null;
    }
  },

  async getNowPlaying(roomId) {
    const r = await this.getRoom(roomId);
    return r ? r.nowPlaying : null;
  },

  async getParticipants(roomId) {
    const r = await this.getRoom(roomId);
    return r ? r.participants || [] : [];
  },

  async getRoomState(roomId) {
    const r = await this.getRoom(roomId);
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      songs: r.songs || [],
      nowPlaying: r.nowPlaying || null,
      participants: r.participants || [],
    };
  },

  async getParticipants(roomId) {
    const room = await RoomModel.findById(roomId).lean();
    return room?.participants || [];
  },

  async removeParticipant(roomId, userId) {
    try {
      const room = await RoomModel.findByIdAndUpdate(
        roomId,
        { $pull: { participants: { _id: userId } } },
        { new: true }
      );

      if (!room) {
        throw new Error("Room not found");
      }

      return room.participants;
    } catch (err) {
      console.error("Error removing participant:", err);
      throw err;
    }
  },

  async removeSong(roomId, title) {
    const room = await RoomModel.findByIdAndUpdate(
      roomId,
      { $pull: { songs: { title: title } } },
      { new: true }
    );

    return room?.songs || [];
  },

  async skipSong(roomId) {
    const room = await RoomModel.findById(roomId);

    if (!room || !room.songs.length) return null;

    const songs = room.songs;
    const current = room.nowPlaying;

    // ▶ Nothing playing → start from first song
    if (!current) {
      room.nowPlaying = songs[0];
      await room.save();

      return {
        nowPlaying: songs[0],
        playlist: songs,
      };
    }

    // Find current index
    const currentIndex = songs.findIndex(
      (s) => s._id.toString() === current._id.toString()
    );

    let nextIndex;

    if (currentIndex === -1) {
      // current song was deleted
      nextIndex = 0;
    } else if (currentIndex === songs.length - 1) {
      // wrap to start
      nextIndex = 0;
    } else {
      nextIndex = currentIndex + 1;
    }

    const nextSong = songs[nextIndex];

    room.nowPlaying = nextSong;
    await room.save();

    return {
      nowPlaying: nextSong,
      playlist: songs,
    };
  },

  async previousSong(roomId) {
    try {
      const room = await RoomModel.findById(roomId);

      if (!room) {
        console.log("❌ Room not found");
        return null;
      }

      if (!room.songs || room.songs.length === 0) {
        console.log("❌ No songs in playlist");
        return null;
      }

      const songs = room.songs;
      const current = room.nowPlaying;
      console.log("current: ", current);

      // ▶ If nothing is playing → play LAST song
      if (!current) {
        const lastSong = songs[songs.length - 1];
        room.nowPlaying = lastSong;
        await room.save();

        return {
          nowPlaying: lastSong,
          playlist: songs,
        };
      }

      // 🔑 VERY IMPORTANT: compare safely
      const currentIndex = songs.findIndex(
        (s) => s._id?.toString() === current._id?.toString()
      );

      // ▶ If current song was deleted or not found
      let prevIndex;
      if (currentIndex === -1) {
        prevIndex = songs.length - 1;
      } else if (currentIndex === 0) {
        prevIndex = songs.length - 1;
      } else {
        prevIndex = currentIndex - 1;
      }

      const previousSong = songs[prevIndex];

      if (!previousSong) {
        console.log("❌ Previous song resolved as undefined");
        return null;
      }

      room.nowPlaying = previousSong;
      await room.save();

      return {
        nowPlaying: previousSong,
        playlist: songs,
      };
    } catch (err) {
      console.error("🔥 previousSong error:", err);
      throw err; // this causes 500 → now you'll see REAL error in logs
    }
  },
};
